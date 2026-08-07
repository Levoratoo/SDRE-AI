import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaignDispatches, campaigns, leads, messages } from "@/db/schema";
import { renderTemplate } from "@/lib/message-render";
import { getSession } from "@/lib/session";

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

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
    messageIds?: string[];
    commentIds?: string[];
    storieIds?: string[];
    leadIds?: string[];
    allLeads?: boolean;
    somenteNovos?: boolean;
    limiteLeads?: number;
    minDelayMin?: number;
    maxDelayMin?: number;
    seguir?: boolean;
    comentar?: boolean;
    curtir?: boolean;
    storie?: boolean;
    scheduleStart?: string;
    scheduleEnd?: string;
    scheduleTz?: string;
    scheduleDays?: number[];
    ignorarRespRapida?: boolean;
    ignorarRespSegundos?: number;
  };

  const nome = (body.nome || "").trim().slice(0, 160);
  if (!nome) {
    return NextResponse.json({ ok: false, erro: "Nome obrigatório" }, { status: 400 });
  }

  const messageIds = [
    ...new Set(
      [
        ...(Array.isArray(body.messageIds) ? body.messageIds : []),
        body.messageId || "",
      ]
        .map(String)
        .filter(Boolean),
    ),
  ];
  if (!messageIds.length) {
    return NextResponse.json(
      { ok: false, erro: "Selecione ao menos uma mensagem DM" },
      { status: 400 },
    );
  }

  const dmMsgs = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, session.user.id),
        eq(messages.tipo, "dm"),
        inArray(messages.id, messageIds),
      ),
    );
  if (!dmMsgs.length) {
    return NextResponse.json({ ok: false, erro: "Mensagem DM não encontrada" }, { status: 404 });
  }

  const commentIds = Array.isArray(body.commentIds)
    ? body.commentIds.filter(Boolean)
    : [];
  const storieIds = Array.isArray(body.storieIds)
    ? body.storieIds.filter(Boolean)
    : [];

  const commentMsgs =
    body.comentar && commentIds.length
      ? await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.userId, session.user.id),
              eq(messages.tipo, "comment"),
              inArray(messages.id, commentIds),
            ),
          )
      : [];

  const storieMsgs =
    body.storie && storieIds.length
      ? await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.userId, session.user.id),
              eq(messages.tipo, "storie"),
              inArray(messages.id, storieIds),
            ),
          )
      : [];

  if (body.comentar && !commentMsgs.length) {
    return NextResponse.json(
      { ok: false, erro: "Selecione templates de comentário" },
      { status: 400 },
    );
  }
  if (body.storie && !storieMsgs.length) {
    return NextResponse.json(
      { ok: false, erro: "Selecione templates de stories" },
      { status: 400 },
    );
  }

  const lim = body.limiteLeads && body.limiteLeads > 0 ? body.limiteLeads : 500;
  const somenteNovos = body.somenteNovos !== false;

  let sentLeadIds: string[] = [];
  if (somenteNovos) {
    const sentRows = await db
      .select({ leadId: campaignDispatches.leadId })
      .from(campaignDispatches)
      .innerJoin(campaigns, eq(campaignDispatches.campaignId, campaigns.id))
      .where(
        and(
          eq(campaigns.userId, session.user.id),
          eq(campaignDispatches.status, "sent"),
        ),
      );
    sentLeadIds = [...new Set(sentRows.map((r) => r.leadId))];
  }

  let selectedLeads: (typeof leads.$inferSelect)[] = [];
  if (body.allLeads || !body.leadIds?.length) {
    const conds = [eq(leads.userId, session.user.id)];
    selectedLeads = await db
      .select()
      .from(leads)
      .where(
        sentLeadIds.length
          ? and(...conds, notInArray(leads.id, sentLeadIds))
          : and(...conds),
      )
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
          ...(sentLeadIds.length ? [notInArray(leads.id, sentLeadIds)] : []),
        ),
      );
  }

  if (!selectedLeads.length) {
    return NextResponse.json(
      {
        ok: false,
        erro: somenteNovos
          ? "Nenhum lead novo disponível (todos já receberam DM)."
          : "Nenhum lead na base. Extraia seguidores antes.",
      },
      { status: 400 },
    );
  }

  const minDelayMin = Math.max(1, Number(body.minDelayMin) || 3);
  const maxDelayMin = Math.max(minDelayMin, Number(body.maxDelayMin) || 8);
  const scheduleDays =
    Array.isArray(body.scheduleDays) && body.scheduleDays.length
      ? body.scheduleDays.map(Number).filter((n) => n >= 0 && n <= 6)
      : [1, 2, 3, 4, 5];

  const [camp] = await db
    .insert(campaigns)
    .values({
      userId: session.user.id,
      nome,
      status: "draft",
      minDelayMin,
      maxDelayMin,
      seguir: !!body.seguir,
      comentar: !!body.comentar,
      curtir: !!body.curtir,
      storie: !!body.storie,
      messageIds: dmMsgs.map((m) => m.id),
      commentIds: commentMsgs.map((m) => m.id),
      storieIds: storieMsgs.map((m) => m.id),
      scheduleStart: (body.scheduleStart || "").trim() || null,
      scheduleEnd: (body.scheduleEnd || "").trim() || null,
      scheduleTz: (body.scheduleTz || "America/Sao_Paulo").trim(),
      scheduleDays,
      ignorarRespRapida: !!body.ignorarRespRapida,
      ignorarRespSegundos: Number(body.ignorarRespSegundos) || 30,
      total: selectedLeads.length,
      enviados: 0,
      erros: 0,
    })
    .returning();

  await db.insert(campaignDispatches).values(
    selectedLeads.map((lead) => {
      const dm = pickRandom(dmMsgs);
      const comment = commentMsgs.length ? pickRandom(commentMsgs) : null;
      const storieMsg = storieMsgs.length ? pickRandom(storieMsgs) : null;
      const vars = { username: lead.username, fullName: lead.fullName };
      return {
        campaignId: camp.id,
        leadId: lead.id,
        leadUsername: lead.username,
        mensagemRender: renderTemplate(dm.texto, vars),
        comentarioRender: comment
          ? renderTemplate(comment.texto, vars)
          : null,
        storieRender: storieMsg
          ? renderTemplate(storieMsg.texto, vars)
          : null,
        status: "pending" as const,
        followStatus: body.seguir ? "pending" : null,
        likeStatus: body.curtir ? "pending" : null,
        comentarioStatus: body.comentar ? "pending" : null,
        storieStatus: body.storie ? "pending" : null,
      };
    }),
  );

  return NextResponse.json({ ok: true, campanha: camp });
}
