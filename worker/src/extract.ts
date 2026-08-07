import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, extractions, igSessions, leads } from "./db";
import {
  fetchFollowersPage,
  fetchProfile,
  openIgSession,
  randBetween,
  sleep,
  type IgSession,
} from "./ig";

const log = (...args: unknown[]) => console.log("[extract]", ...args);

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
  users: {
    pk: number;
    username: string;
    full_name: string;
    is_private: boolean;
    is_verified: boolean;
    is_business: boolean;
  }[],
) {
  let novos = 0;
  for (const u of users) {
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

  const jobs = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.status, "queued"), isNull(extractions.claimedAt)))
    .orderBy(asc(extractions.iniciadoEm))
    .limit(1);

  const job = jobs[0];
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

  log("job", claimed.id, "@" + claimed.perfilAlvoUsername);

  const session = await getSession(claimed.userId);
  if (!session?.sessionid) {
    await db
      .update(extractions)
      .set({
        status: "error",
        erroMensagem: "Sem sessão IG sincronizada — use a extensão uma vez.",
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

    const delayMin = claimed.delayMinMs && claimed.delayMinMs >= 400
      ? claimed.delayMinMs
      : 700;
    const delayMax =
      claimed.delayMaxMs && claimed.delayMaxMs > delayMin
        ? claimed.delayMaxMs
        : 1600;
    const limite = claimed.limite && claimed.limite > 0 ? claimed.limite : null;

    let maxId: string | null = null;
    let captured = 0;

    while (true) {
      if (limite && captured >= limite) break;

      let pageData;
      try {
        pageData = await fetchFollowersPage(page, profile.pk, maxId);
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "RATE") {
          log("rate limit — pausando 20min");
          await sleep(20 * 60 * 1000);
          continue;
        }
        if (err.code === "AUTH") throw new Error("Sessão IG inválida durante extração");
        throw err;
      }

      const take = limite
        ? pageData.users.slice(0, Math.max(0, limite - captured))
        : pageData.users;

      await upsertLeads(claimed.userId, claimed.id, take);
      captured += take.length;
      maxId = pageData.next_max_id;

      await db
        .update(extractions)
        .set({ maxId })
        .where(eq(extractions.id, claimed.id));

      log("capturados neste job ~", captured);

      if (!maxId || (limite && captured >= limite)) break;
      await sleep(randBetween(delayMin, delayMax));
    }

    await db
      .update(extractions)
      .set({ status: "finished", finalizadoEm: new Date(), erroMensagem: null })
      .where(eq(extractions.id, claimed.id));

    log("finished", claimed.id, "captured~", captured);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("error", msg);
    await db
      .update(extractions)
      .set({
        status: "error",
        erroMensagem: msg.slice(0, 500),
        finalizadoEm: new Date(),
      })
      .where(eq(extractions.id, claimed.id));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return true;
}
