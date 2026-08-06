import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaignDispatches, campaigns } from "@/db/schema";
import { getSession } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

async function ownedCampaign(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const camp = await ownedCampaign(session.user.id, id);
  if (!camp) {
    return NextResponse.json({ ok: false, erro: "Não encontrada" }, { status: 404 });
  }

  const [pending] = await db
    .select({ value: count() })
    .from(campaignDispatches)
    .where(
      and(
        eq(campaignDispatches.campaignId, id),
        eq(campaignDispatches.status, "pending"),
      ),
    );

  return NextResponse.json({
    ok: true,
    campanha: camp,
    restantes: pending?.value ?? 0,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const camp = await ownedCampaign(session.user.id, id);
  if (!camp) {
    return NextResponse.json({ ok: false, erro: "Não encontrada" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: "start" | "pause" | "resume" | "cancel";
  };

  const action = body.action;
  if (!action) {
    return NextResponse.json({ ok: false, erro: "action obrigatória" }, { status: 400 });
  }

  if (action === "start" || action === "resume") {
    if (camp.status === "finished" || camp.status === "cancelled") {
      return NextResponse.json(
        { ok: false, erro: "Campanha já encerrada" },
        { status: 400 },
      );
    }
    const [updated] = await db
      .update(campaigns)
      .set({
        status: "running",
        iniciadoEm: camp.iniciadoEm || new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();
    return NextResponse.json({
      ok: true,
      campanha: updated,
      aviso: "Play ligado. O worker na VPS começa a disparar.",
    });
  }

  if (action === "pause") {
    const [updated] = await db
      .update(campaigns)
      .set({ status: "paused", atualizadoEm: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return NextResponse.json({ ok: true, campanha: updated });
  }

  if (action === "cancel") {
    await db
      .update(campaignDispatches)
      .set({ status: "skipped", erroMensagem: "campanha_cancelada" })
      .where(
        and(
          eq(campaignDispatches.campaignId, id),
          eq(campaignDispatches.status, "pending"),
        ),
      );
    const [updated] = await db
      .update(campaigns)
      .set({ status: "cancelled", atualizadoEm: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return NextResponse.json({ ok: true, campanha: updated });
  }

  return NextResponse.json({ ok: false, erro: "action inválida" }, { status: 400 });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const camp = await ownedCampaign(session.user.id, id);
  if (!camp) {
    return NextResponse.json({ ok: false, erro: "Não encontrada" }, { status: 404 });
  }
  if (camp.status === "running") {
    return NextResponse.json(
      { ok: false, erro: "Pause ou cancele antes de excluir" },
      { status: 400 },
    );
  }
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}
