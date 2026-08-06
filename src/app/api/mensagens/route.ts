import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const tipo = new URL(req.url).searchParams.get("tipo");
  const rows = await db
    .select()
    .from(messages)
    .where(
      tipo
        ? and(
            eq(messages.userId, session.user.id),
            eq(messages.tipo, tipo as "dm" | "comment" | "storie"),
          )
        : eq(messages.userId, session.user.id),
    )
    .orderBy(desc(messages.criadoEm));

  return NextResponse.json({ ok: true, mensagens: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    titulo?: string;
    texto?: string;
    tipo?: "dm" | "comment" | "storie";
  };
  const titulo = (body.titulo || "").trim().slice(0, 120);
  const texto = (body.texto || "").trim();
  if (!titulo || !texto) {
    return NextResponse.json({ ok: false, erro: "Título e texto obrigatórios" }, { status: 400 });
  }
  const [row] = await db
    .insert(messages)
    .values({
      userId: session.user.id,
      tipo: body.tipo || "dm",
      titulo,
      texto,
    })
    .returning();
  return NextResponse.json({ ok: true, mensagem: row });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });
  }
  await db
    .delete(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
