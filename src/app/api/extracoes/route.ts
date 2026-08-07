import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { extractions } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(extractions)
    .where(eq(extractions.userId, session.user.id))
    .orderBy(desc(extractions.iniciadoEm))
    .limit(100);

  return NextResponse.json({
    ok: true,
    extracoes: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      perfilAlvoUsername: r.perfilAlvoUsername,
      perfilAlvoSeguidores: r.perfilAlvoSeguidores,
      capturados: r.capturados,
      limite: r.limite,
      status: r.status,
      erroMensagem: r.erroMensagem,
      iniciadoEm: r.iniciadoEm?.toISOString() ?? null,
      finalizadoEm: r.finalizadoEm?.toISOString() ?? null,
    })),
  });
}
