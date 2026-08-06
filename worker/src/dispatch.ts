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
