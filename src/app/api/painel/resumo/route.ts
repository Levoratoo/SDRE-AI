import { and, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, extractions, leads } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const [leadsCount] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.userId, userId));

  const [extrCount] = await db
    .select({ value: count() })
    .from(extractions)
    .where(eq(extractions.userId, userId));

  const [runningExtr] = await db
    .select({ value: count() })
    .from(extractions)
    .where(
      and(
        eq(extractions.userId, userId),
        inArray(extractions.status, ["running", "queued"]),
      ),
    );

  const [runningCamps] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "running")));

  const latest = await db
    .select({
      id: extractions.id,
      perfilAlvoUsername: extractions.perfilAlvoUsername,
      capturados: extractions.capturados,
      status: extractions.status,
      iniciadoEm: extractions.iniciadoEm,
    })
    .from(extractions)
    .where(eq(extractions.userId, userId))
    .orderBy(desc(extractions.iniciadoEm))
    .limit(8);

  return NextResponse.json({
    ok: true,
    stats: {
      extracoes: Number(extrCount?.value ?? 0),
      emAndamento: Number(runningExtr?.value ?? 0),
      campanhasRodando: Number(runningCamps?.value ?? 0),
      leads: Number(leadsCount?.value ?? 0),
    },
    ultimasExtracoes: latest.map((r) => ({
      id: r.id,
      perfilAlvoUsername: r.perfilAlvoUsername,
      capturados: r.capturados,
      status: r.status,
      iniciadoEm: r.iniciadoEm?.toISOString() ?? null,
    })),
  });
}
