import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaignDispatches, campaigns, leads, messages } from "@/db/schema";
import { renderTemplate } from "@/lib/message-render";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.userId, session.user.id))
    .orderBy(desc(campaigns.criadoEm))
    .limit(50);

  return NextResponse.json({ ok: true, campanhas: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    nome?: string;
    messageId?: string;
    leadIds?: string[];
    allLeads?: boolean;
    limiteLeads?: number;
    minDelayMin?: number;
    maxDelayMin?: number;
    seguir?: boolean;
  };

  const nome = (body.nome || "").trim().slice(0, 160);
  if (!nome) {
    return NextResponse.json({ ok: false, erro: "Nome obrigatório" }, { status: 400 });
  }
  if (!body.messageId) {
    return NextResponse.json({ ok: false, erro: "Selecione uma mensagem DM" }, { status: 400 });
  }

  const [msg] = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.id, body.messageId), eq(messages.userId, session.user.id)),
    )
    .limit(1);
  if (!msg) {
    return NextResponse.json({ ok: false, erro: "Mensagem não encontrada" }, { status: 404 });
  }

  let selectedLeads: (typeof leads.$inferSelect)[] = [];
  if (body.allLeads || !body.leadIds?.length) {
    const lim = body.limiteLeads && body.limiteLeads > 0 ? body.limiteLeads : 500;
    selectedLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.userId, session.user.id))
      .orderBy(desc(leads.capturadoEm))
      .limit(lim);
  } else {
    selectedLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.userId, session.user.id),
          inArray(leads.id, body.leadIds),
        ),
      );
  }

  if (!selectedLeads.length) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum lead na base. Extraia seguidores antes." },
      { status: 400 },
    );
  }

  const minDelayMin = Math.max(1, Number(body.minDelayMin) || 3);
  const maxDelayMin = Math.max(minDelayMin, Number(body.maxDelayMin) || 8);

  const [camp] = await db
    .insert(campaigns)
    .values({
      userId: session.user.id,
      nome,
      status: "draft",
      minDelayMin,
      maxDelayMin,
      seguir: !!body.seguir,
      messageIds: [msg.id],
      total: selectedLeads.length,
      enviados: 0,
      erros: 0,
    })
    .returning();

  await db.insert(campaignDispatches).values(
    selectedLeads.map((lead) => ({
      campaignId: camp.id,
      leadId: lead.id,
      leadUsername: lead.username,
      mensagemRender: renderTemplate(msg.texto, {
        username: lead.username,
        fullName: lead.fullName,
      }),
      status: "pending" as const,
      followStatus: body.seguir ? "pending" : null,
    })),
  );

  return NextResponse.json({ ok: true, campanha: camp });
}
