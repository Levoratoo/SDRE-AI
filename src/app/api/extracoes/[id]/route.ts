import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { extractions, leads } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.id, id), eq(extractions.userId, session.user.id)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ ok: false, erro: "Extração não encontrada" }, { status: 404 });
  }

  if (row.status === "running" || row.status === "queued") {
    return NextResponse.json(
      { ok: false, erro: "Pause ou finalize a extração antes de excluir" },
      { status: 400 },
    );
  }

  await db
    .update(leads)
    .set({ extractionId: null })
    .where(eq(leads.extractionId, id));

  await db
    .delete(extractions)
    .where(and(eq(extractions.id, id), eq(extractions.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
