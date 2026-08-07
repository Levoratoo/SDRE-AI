import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignDispatches, campaigns } from "@/db/schema";
import {
  jsonErro,
  jsonOk,
  readJsonBody,
  requireApiUser,
} from "@/lib/insta-api";
import { isWithinSchedule } from "@/lib/schedule";

export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  if (action === "list_active") {
    const rows = await db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.userId, auth.user.id), eq(campaigns.status, "running")),
      );

    const campanhas = await Promise.all(
      rows.map(async (c) => {
        const [pend] = await db
          .select({ value: count() })
          .from(campaignDispatches)
          .where(
            and(
              eq(campaignDispatches.campaignId, c.id),
              eq(campaignDispatches.status, "pending"),
            ),
          );
        return {
          id: c.id,
          nome: c.nome,
          status: c.status,
          total: c.total,
          enviados: c.enviados,
          erros: c.erros,
          min_delay_min: c.minDelayMin,
          max_delay_min: c.maxDelayMin,
          restantes: pend?.value ?? 0,
          criado_em: c.criadoEm,
        };
      }),
    );

    return jsonOk({ campanhas });
  }

  if (action === "check_status") {
    const campanhaId = url.searchParams.get("campanha_id");
    if (!campanhaId) return jsonErro("campanha_id obrigatório");
    const [c] = await db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.id, campanhaId), eq(campaigns.userId, auth.user.id)),
      )
      .limit(1);
    if (!c) return jsonErro("Campanha não encontrada", 404);
    if (c.status !== "running") {
      return jsonOk({ executavel: false, motivo: `status_${c.status}` });
    }
    const win = isWithinSchedule({
      scheduleStart: c.scheduleStart,
      scheduleEnd: c.scheduleEnd,
      scheduleTz: c.scheduleTz,
      scheduleDays: c.scheduleDays,
    });
    if (!win.ok) {
      return jsonOk({ executavel: false, motivo: win.motivo });
    }
    return jsonOk({ executavel: true, motivo: null });
  }

  if (action === "next_lote") {
    const campanhaId = url.searchParams.get("campanha_id");
    if (!campanhaId) return jsonErro("campanha_id obrigatório");
    const [c] = await db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.id, campanhaId), eq(campaigns.userId, auth.user.id)),
      )
      .limit(1);
    if (!c || c.status !== "running") {
      return jsonOk({ fim_da_fila: true, leads: [] });
    }
    const win = isWithinSchedule({
      scheduleStart: c.scheduleStart,
      scheduleEnd: c.scheduleEnd,
      scheduleTz: c.scheduleTz,
      scheduleDays: c.scheduleDays,
    });
    if (!win.ok) {
      return jsonOk({ fim_da_fila: false, leads: [], aguardar: true, motivo: win.motivo });
    }
    // libera claims órfãos da extensão (>15 min)
    await db
      .update(campaignDispatches)
      .set({ claimedAt: null })
      .where(
        and(
          eq(campaignDispatches.campaignId, campanhaId),
          eq(campaignDispatches.status, "pending"),
          sql`${campaignDispatches.claimedAt} IS NOT NULL`,
          sql`${campaignDispatches.claimedAt} < NOW() - INTERVAL '15 minutes'`,
        ),
      );

    const [candidate] = await db
      .select()
      .from(campaignDispatches)
      .where(
        and(
          eq(campaignDispatches.campaignId, campanhaId),
          eq(campaignDispatches.status, "pending"),
          isNull(campaignDispatches.claimedAt),
        ),
      )
      .limit(1);
    if (!candidate) return jsonOk({ fim_da_fila: true, leads: [] });

    const [d] = await db
      .update(campaignDispatches)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(campaignDispatches.id, candidate.id),
          eq(campaignDispatches.status, "pending"),
          isNull(campaignDispatches.claimedAt),
        ),
      )
      .returning();
    if (!d) return jsonOk({ fim_da_fila: false, leads: [], aguardar: true });

    return jsonOk({
      fim_da_fila: false,
      min_delay_min: c.minDelayMin,
      max_delay_min: c.maxDelayMin,
      leads: [
        {
          id: d.id,
          lead_username: d.leadUsername,
          mensagem_render: d.mensagemRender,
          seguir_perfil: c.seguir,
          follow_status: d.followStatus,
          curtir_ultimo_post: c.curtir,
          like_status: d.likeStatus,
          comentario_render: d.comentarioRender,
          storie_render: d.storieRender,
        },
      ],
    });
  }

  if (action === "stats_erros") {
    const campanhaId = url.searchParams.get("campanha_id");
    if (!campanhaId) return jsonErro("campanha_id obrigatório");
    const [c] = await db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.id, campanhaId), eq(campaigns.userId, auth.user.id)),
      )
      .limit(1);
    if (!c) return jsonErro("Campanha não encontrada", 404);

    const rows = await db
      .select({
        motivo: campaignDispatches.erroMensagem,
        qtd: count(),
      })
      .from(campaignDispatches)
      .where(
        and(
          eq(campaignDispatches.campaignId, campanhaId),
          eq(campaignDispatches.status, "error"),
        ),
      )
      .groupBy(campaignDispatches.erroMensagem);

    return jsonOk({
      erros_por_motivo: rows.map((r) => ({
        motivo: r.motivo || "erro",
        quantidade: Number(r.qtd) || 0,
      })),
    });
  }

  return jsonOk({ action, note: "ok" });
}

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const body = (await readJsonBody<Record<string, unknown>>(req)) || {};

  if (action === "mark_dm_sent" || action === "mark_sent") {
    const disparoId = String(body.disparo_id || "");
    if (!disparoId) return jsonErro("disparo_id obrigatório");
    const [d] = await db
      .select()
      .from(campaignDispatches)
      .where(eq(campaignDispatches.id, disparoId))
      .limit(1);
    if (!d) return jsonErro("Disparo não encontrado", 404);

    await db
      .update(campaignDispatches)
      .set({
        status: "sent",
        enviadoEm: new Date(),
        claimedAt: null,
        followStatus: body.follow_status
          ? String(body.follow_status)
          : d.followStatus,
        likeStatus: body.like_status ? String(body.like_status) : d.likeStatus,
        comentarioStatus: body.comentario_status
          ? String(body.comentario_status)
          : d.comentarioStatus,
        storieStatus: body.storie_status
          ? String(body.storie_status)
          : d.storieStatus,
      })
      .where(eq(campaignDispatches.id, disparoId));

    if (action === "mark_sent") {
      await db
        .update(campaigns)
        .set({
          enviados: sql`${campaigns.enviados} + 1`,
          atualizadoEm: new Date(),
        })
        .where(eq(campaigns.id, d.campaignId));
    }
    return jsonOk({ accepted: true });
  }

  if (action === "mark_error") {
    const disparoId = String(body.disparo_id || "");
    if (!disparoId) return jsonErro("disparo_id obrigatório");
    const [d] = await db
      .select()
      .from(campaignDispatches)
      .where(eq(campaignDispatches.id, disparoId))
      .limit(1);
    if (!d) return jsonErro("Disparo não encontrado", 404);

    await db
      .update(campaignDispatches)
      .set({
        status: "error",
        erroMensagem: String(body.erro_mensagem || "erro").slice(0, 500),
        claimedAt: null,
      })
      .where(eq(campaignDispatches.id, disparoId));

    await db
      .update(campaigns)
      .set({
        erros: sql`${campaigns.erros} + 1`,
        atualizadoEm: new Date(),
        ...(body.sessao_invalida ? { status: "paused" as const } : {}),
      })
      .where(eq(campaigns.id, d.campaignId));

    return jsonOk({ accepted: true });
  }

  return jsonOk({ accepted: true });
}
