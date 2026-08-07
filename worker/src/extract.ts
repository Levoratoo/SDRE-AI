import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, extractions, igSessions, leads, users } from "./db";
import { isUserActive } from "./account";
import {
  getLastExtractUserId,
  markExtractUser,
  pickFairUserId,
} from "./fair";
import {
  fetchFollowersPage,
  fetchProfile,
  openIgSession,
  randBetween,
  sleep,
  type IgFollower,
  type IgSession,
} from "./ig";

const log = (meta: Record<string, unknown>, ...args: unknown[]) =>
  console.log("[extract]", { ...meta, msg: args.join(" ") });

async function getSession(userId: string): Promise<IgSession | null> {
  const rows = await db
    .select()
    .from(igSessions)
    .where(eq(igSessions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertLeads(
  userId: string,
  extractionId: string,
  users: IgFollower[],
) {
  let novos = 0;
  for (const u of users) {
    if (!u.pk || !u.username) continue;
    const pk = String(u.pk);
    const existing = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.userId, userId), eq(leads.pk, pk)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(leads)
        .set({
          username: u.username.slice(0, 120),
          fullName: (u.full_name || "").slice(0, 160) || null,
          isPrivate: u.is_private,
          isVerified: u.is_verified,
          isBusiness: u.is_business,
          extractionId,
        })
        .where(eq(leads.id, existing[0].id));
    } else {
      await db.insert(leads).values({
        userId,
        pk,
        username: u.username.slice(0, 120),
        fullName: (u.full_name || "").slice(0, 160) || null,
        isPrivate: u.is_private,
        isVerified: u.is_verified,
        isBusiness: u.is_business,
        extractionId,
        capturadoEm: new Date(),
      });
      novos++;
    }
  }
  if (novos > 0) {
    await db
      .update(extractions)
      .set({ capturados: sql`${extractions.capturados} + ${novos}` })
      .where(eq(extractions.id, extractionId));
  }
  return novos;
}

async function stillActive(id: string): Promise<"running" | "paused" | "stop"> {
  const [row] = await db
    .select({ status: extractions.status })
    .from(extractions)
    .where(eq(extractions.id, id))
    .limit(1);
  if (!row) return "stop";
  if (row.status === "paused" || row.status === "cancelled") return "paused";
  if (row.status === "running" || row.status === "queued") return "running";
  return "stop";
}

export async function processNextExtraction(): Promise<boolean> {
  // liberar claims órfãos
  await db
    .update(extractions)
    .set({ claimedAt: null })
    .where(
      and(
        eq(extractions.status, "queued"),
        sql`${extractions.claimedAt} IS NOT NULL`,
        sql`${extractions.claimedAt} < NOW() - INTERVAL '10 minutes'`,
      ),
    );

  const candidates = await db
    .select({ job: extractions })
    .from(extractions)
    .innerJoin(users, eq(users.id, extractions.userId))
    .where(
      and(
        eq(extractions.status, "queued"),
        isNull(extractions.claimedAt),
        inArray(users.accountStatus, ["active", "trial"]),
      ),
    )
    .orderBy(asc(extractions.iniciadoEm))
    .limit(20);

  const job = pickFairUserId(
    candidates.map((r) => r.job),
    getLastExtractUserId(),
  );
  if (!job) return false;

  const [claimed] = await db
    .update(extractions)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(extractions.id, job.id),
        eq(extractions.status, "queued"),
        isNull(extractions.claimedAt),
      ),
    )
    .returning();

  if (!claimed) return false;

  markExtractUser(claimed.userId);

  if (!(await isUserActive(claimed.userId))) {
    await db
      .update(extractions)
      .set({
        status: "error",
        erroMensagem: "Conta suspensa — contate o suporte.",
        finalizadoEm: new Date(),
        claimedAt: null,
      })
      .where(eq(extractions.id, claimed.id));
    log(
      { userId: claimed.userId, jobId: claimed.id, action: "skip_suspended" },
      "conta suspensa",
    );
    return true;
  }

  log(
    { userId: claimed.userId, jobId: claimed.id, action: "start" },
    "@" + claimed.perfilAlvoUsername,
  );

  const session = await getSession(claimed.userId);
  if (!session?.sessionid) {
    await db
      .update(extractions)
      .set({
        status: "error",
        erroMensagem: "Sem sessão IG — cole o sessionid em Minha Conta.",
        finalizadoEm: new Date(),
      })
      .where(eq(extractions.id, claimed.id));
    return true;
  }

  let browser;
  try {
    const opened = await openIgSession(session);
    browser = opened.browser;
    const { page } = opened;

    await page.goto(
      `https://www.instagram.com/${encodeURIComponent(claimed.perfilAlvoUsername)}/`,
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );
    await sleep(800);

    const profile = await fetchProfile(page, claimed.perfilAlvoUsername);

    await db
      .update(extractions)
      .set({
        status: "running",
        perfilAlvoPk: String(profile.pk),
        perfilAlvoFullName: profile.full_name.slice(0, 160) || null,
        perfilAlvoIsPrivate: profile.is_private,
        perfilAlvoSeguidores: profile.followers_count,
        erroMensagem: null,
      })
      .where(eq(extractions.id, claimed.id));

    const delayMin =
      claimed.delayMinMs && claimed.delayMinMs >= 400 ? claimed.delayMinMs : 700;
    const delayMax =
      claimed.delayMaxMs && claimed.delayMaxMs > delayMin
        ? claimed.delayMaxMs
        : 1600;
    const limite = claimed.limite && claimed.limite > 0 ? claimed.limite : null;

    // Retoma cursor se existir (extração pausada/re-enfileirada)
    let maxId: string | null = claimed.maxId || null;
    let captured = claimed.capturados || 0;

    while (true) {
      const state = await stillActive(claimed.id);
      if (state === "paused") {
        log(
          { userId: claimed.userId, jobId: claimed.id, action: "paused" },
          "paused by user",
        );
        await db
          .update(extractions)
          .set({ claimedAt: null, maxId, status: "paused" })
          .where(eq(extractions.id, claimed.id));
        return true;
      }
      if (state === "stop") break;

      if (limite && captured >= limite) break;

      let pageData;
      try {
        pageData = await fetchFollowersPage(page, profile.pk, maxId);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "RATE") {
          log(
            { userId: claimed.userId, jobId: claimed.id, action: "rate_limit" },
            "rate limit — pausando 20min",
          );
          await db
            .update(extractions)
            .set({ maxId, erroMensagem: "rate_limit_aguardando" })
            .where(eq(extractions.id, claimed.id));
          await sleep(20 * 60 * 1000);
          continue;
        }
        if (err.code === "AUTH") {
          throw Object.assign(new Error("Sessão IG inválida durante extração"), {
            fatal: true,
          });
        }
        throw err;
      }

      const take = limite
        ? pageData.users.slice(0, Math.max(0, limite - captured))
        : pageData.users;

      const novos = await upsertLeads(claimed.userId, claimed.id, take);
      captured += novos;
      maxId = pageData.next_max_id;

      await db
        .update(extractions)
        .set({ maxId, erroMensagem: null })
        .where(eq(extractions.id, claimed.id));

      log(
        {
          userId: claimed.userId,
          jobId: claimed.id,
          action: "progress",
          captured,
          novos,
        },
        "capturados",
      );

      if (!maxId || (limite && captured >= limite)) break;
      await sleep(randBetween(delayMin, delayMax));
    }

    const finalState = await stillActive(claimed.id);
    if (finalState === "paused") {
      await db
        .update(extractions)
        .set({ claimedAt: null, maxId, status: "paused" })
        .where(eq(extractions.id, claimed.id));
      return true;
    }

    await db
      .update(extractions)
      .set({
        status: "finished",
        finalizadoEm: new Date(),
        erroMensagem: null,
        claimedAt: null,
      })
      .where(eq(extractions.id, claimed.id));

    log(
      { userId: claimed.userId, jobId: claimed.id, action: "finished", captured },
      "finished",
    );
  } catch (e) {
    const err = e as Error & { fatal?: boolean };
    const msg = err.message || String(e);
    log(
      { userId: claimed.userId, jobId: claimed.id, action: "error", error: msg },
      msg,
    );
    await db
      .update(extractions)
      .set({
        status: "error",
        erroMensagem: msg.slice(0, 500),
        finalizadoEm: new Date(),
        claimedAt: null,
      })
      .where(eq(extractions.id, claimed.id));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return true;
}
