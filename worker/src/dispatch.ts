import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { campaignDispatches, campaigns, db, igSessions } from "./db";
import {
  commentLatestPost,
  followProfile,
  likeLatestPost,
  openIgSession,
  randBetween,
  replyStory,
  sendDm,
  sleep,
} from "./ig";

const log = (...args: unknown[]) => console.log("[dispatch]", ...args);

function isWithinSchedule(c: {
  scheduleStart: string | null;
  scheduleEnd: string | null;
  scheduleTz: string | null;
  scheduleDays: unknown;
}) {
  const start = (c.scheduleStart || "").trim();
  const end = (c.scheduleEnd || "").trim();
  const days = Array.isArray(c.scheduleDays)
    ? (c.scheduleDays as number[])
    : null;
  if (!start && !end && (!days || !days.length)) return true;

  const tz = c.scheduleTz || "America/Sao_Paulo";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === "weekday")?.value || "Mon";
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = map[wd] ?? 1;
    if (days?.length && !days.includes(day)) return false;
    const hour = parts.find((p) => p.type === "hour")?.value || "00";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    const hm = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    if (start && end) {
      if (start <= end) {
        if (hm < start || hm > end) return false;
      } else if (hm < start && hm > end) {
        return false;
      }
    }
  } catch {
    return true;
  }
  return true;
}

/**
 * Processa 1 disparo pendente de campanha running (VPS 24/7).
 */
export async function processNextDispatch(): Promise<boolean> {
  // libera claims órfãos (>15 min)
  await db
    .update(campaignDispatches)
    .set({ claimedAt: null })
    .where(
      and(
        eq(campaignDispatches.status, "pending"),
        sql`${campaignDispatches.claimedAt} IS NOT NULL`,
        sql`${campaignDispatches.claimedAt} < NOW() - INTERVAL '15 minutes'`,
      ),
    );

  const rows = await db
    .select({
      dispatch: campaignDispatches,
      campaign: campaigns,
    })
    .from(campaignDispatches)
    .innerJoin(campaigns, eq(campaigns.id, campaignDispatches.campaignId))
    .where(
      and(
        eq(campaigns.status, "running"),
        eq(campaignDispatches.status, "pending"),
        isNull(campaignDispatches.claimedAt),
      ),
    )
    .orderBy(asc(campaignDispatches.criadoEm))
    .limit(1);

  const row = rows[0];
  if (!row) return false;

  const { campaign } = row;

  if (!isWithinSchedule(campaign)) {
    log("fora da janela", campaign.nome);
    await sleep(60_000);
    return true;
  }

  const [claimed] = await db
    .update(campaignDispatches)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(campaignDispatches.id, row.dispatch.id),
        eq(campaignDispatches.status, "pending"),
        isNull(campaignDispatches.claimedAt),
      ),
    )
    .returning();

  if (!claimed) return false;

  const dispatch = claimed;
  log("lead", dispatch.leadUsername, "campanha", campaign.nome);

  const [session] = await db
    .select()
    .from(igSessions)
    .where(eq(igSessions.userId, campaign.userId))
    .limit(1);

  if (!session?.sessionid) {
    await db
      .update(campaignDispatches)
      .set({
        status: "error",
        erroMensagem: "Sem sessão IG no servidor",
        claimedAt: null,
      })
      .where(eq(campaignDispatches.id, dispatch.id));
    await db
      .update(campaigns)
      .set({
        erros: sql`${campaigns.erros} + 1`,
        atualizadoEm: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));
    return true;
  }

  const hasDm = !!dispatch.mensagemRender?.trim();
  const hasComment = campaign.comentar && !!dispatch.comentarioRender?.trim();
  const hasStorie = campaign.storie && !!dispatch.storieRender?.trim();
  if (!hasDm && !campaign.seguir && !campaign.curtir && !hasComment && !hasStorie) {
    await db
      .update(campaignDispatches)
      .set({
        status: "error",
        erroMensagem: "nada_para_fazer",
        claimedAt: null,
      })
      .where(eq(campaignDispatches.id, dispatch.id));
    return true;
  }

  let browser;
  try {
    // confirma campanha ainda running
    const [alive] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id))
      .limit(1);
    if (!alive || alive.status !== "running") {
      await db
        .update(campaignDispatches)
        .set({ claimedAt: null })
        .where(eq(campaignDispatches.id, dispatch.id));
      return true;
    }

    const opened = await openIgSession(session);
    browser = opened.browser;
    const { page } = opened;

    if (hasDm) {
      await sendDm(page, dispatch.leadUsername, dispatch.mensagemRender!.trim());
    }

    let followStatus: string | null = dispatch.followStatus;
    let likeStatus: string | null = dispatch.likeStatus;
    let comentarioStatus: string | null = dispatch.comentarioStatus;
    let storieStatus: string | null = dispatch.storieStatus;

    if (campaign.seguir) {
      await sleep(randBetween(8000, 15000));
      const ok = await followProfile(page, dispatch.leadUsername);
      followStatus = ok ? "sent" : "error";
    }

    if (campaign.curtir) {
      await sleep(randBetween(5000, 10000));
      const r = await likeLatestPost(page, dispatch.leadUsername);
      likeStatus = r === "already" ? "already" : r === "sent" ? "sent" : "error";
    }

    if (hasComment) {
      await sleep(randBetween(5000, 10000));
      const r = await commentLatestPost(
        page,
        dispatch.leadUsername,
        dispatch.comentarioRender!.trim(),
      );
      comentarioStatus =
        r === "sent" ? "sent" : r === "disabled" ? "disabled" : "error";
    }

    if (hasStorie) {
      await sleep(randBetween(5000, 10000));
      const r = await replyStory(
        page,
        dispatch.leadUsername,
        dispatch.storieRender!.trim(),
      );
      storieStatus =
        r === "sent" ? "sent" : r === "skipped" ? "skipped" : "error";
    }

    await db
      .update(campaignDispatches)
      .set({
        status: "sent",
        followStatus,
        likeStatus,
        comentarioStatus,
        storieStatus,
        enviadoEm: new Date(),
        erroMensagem: null,
        claimedAt: null,
      })
      .where(eq(campaignDispatches.id, dispatch.id));

    await db
      .update(campaigns)
      .set({
        enviados: sql`${campaigns.enviados} + 1`,
        atualizadoEm: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    log("sent ok", dispatch.leadUsername);

    const minMs = (campaign.minDelayMin || 3) * 60 * 1000;
    const maxMs = Math.max(minMs, (campaign.maxDelayMin || 8) * 60 * 1000);
    const wait = randBetween(minMs, maxMs);
    log("sleep", Math.round(wait / 1000), "s");
    await sleep(wait);
  } catch (e) {
    const err = e as Error & { fatal?: boolean; code?: string };
    const msg = err.message || String(e);
    log("error", msg);
    const fatal = !!err.fatal || err.code === "AUTH";
    await db
      .update(campaignDispatches)
      .set({
        status: "error",
        erroMensagem: msg.slice(0, 500),
        claimedAt: null,
      })
      .where(eq(campaignDispatches.id, dispatch.id));
    await db
      .update(campaigns)
      .set({
        erros: sql`${campaigns.erros} + 1`,
        atualizadoEm: new Date(),
        ...(fatal ? { status: "paused" as const } : {}),
      })
      .where(eq(campaigns.id, campaign.id));

    if (!fatal) {
      await sleep(randBetween(60_000, 120_000));
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const [pending] = await db
    .select({ id: campaignDispatches.id })
    .from(campaignDispatches)
    .where(
      and(
        eq(campaignDispatches.campaignId, campaign.id),
        eq(campaignDispatches.status, "pending"),
      ),
    )
    .limit(1);

  if (!pending) {
    await db
      .update(campaigns)
      .set({ status: "finished", atualizadoEm: new Date() })
      .where(eq(campaigns.id, campaign.id));
    log("campanha finished", campaign.id);
  }

  return true;
}
