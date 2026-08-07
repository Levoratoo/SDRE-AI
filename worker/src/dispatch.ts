import { and, asc, eq, sql } from "drizzle-orm";
import {
  campaignDispatches,
  campaigns,
  db,
  igSessions,
} from "./db";
import {
  followProfile,
  openIgSession,
  randBetween,
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
 * Processa 1 disparo pendente de campanha running.
 * Requer campanha criada no painel (Fase 4 UI) + sessão IG sync.
 */
export async function processNextDispatch(): Promise<boolean> {
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
      ),
    )
    .orderBy(asc(campaignDispatches.criadoEm))
    .limit(1);

  const row = rows[0];
  if (!row) return false;

  const { dispatch, campaign } = row;
  log("lead", dispatch.leadUsername, "campanha", campaign.nome);

  if (!isWithinSchedule(campaign)) {
    log("fora da janela", campaign.nome);
    await sleep(60_000);
    return true;
  }

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

  if (!dispatch.mensagemRender?.trim()) {
    await db
      .update(campaignDispatches)
      .set({ status: "error", erroMensagem: "mensagem_vazia" })
      .where(eq(campaignDispatches.id, dispatch.id));
    return true;
  }

  let browser;
  try {
    const opened = await openIgSession(session);
    browser = opened.browser;
    const { page } = opened;

    await sendDm(page, dispatch.leadUsername, dispatch.mensagemRender);

    let followStatus: string | null = dispatch.followStatus;
    if (campaign.seguir) {
      await sleep(randBetween(8000, 15000));
      const ok = await followProfile(page, dispatch.leadUsername);
      followStatus = ok ? "sent" : "error";
    }

    await db
      .update(campaignDispatches)
      .set({
        status: "sent",
        followStatus,
        enviadoEm: new Date(),
        erroMensagem: null,
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
    const maxMs = (campaign.maxDelayMin || 8) * 60 * 1000;
    const wait = randBetween(minMs, maxMs);
    log("sleep", Math.round(wait / 1000), "s");
    await sleep(wait);
  } catch (e) {
    const err = e as Error & { fatal?: boolean };
    const msg = err.message || String(e);
    log("error", msg);
    await db
      .update(campaignDispatches)
      .set({ status: "error", erroMensagem: msg.slice(0, 500) })
      .where(eq(campaignDispatches.id, dispatch.id));
    await db
      .update(campaigns)
      .set({
        erros: sql`${campaigns.erros} + 1`,
        atualizadoEm: new Date(),
        ...(err.fatal ? { status: "paused" as const } : {}),
      })
      .where(eq(campaigns.id, campaign.id));

    if (!err.fatal) {
      await sleep(randBetween(60_000, 120_000));
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // se acabou a fila, marca campanha finished
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
