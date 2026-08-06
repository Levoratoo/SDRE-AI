import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { extractions } from "@/db/schema";
import { jsonOk, requireApiUser } from "@/lib/insta-api";

/** Lista jobs enfileirados pelo painel (ainda não reivindicados). */
export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  // Liberar claims órfãos (>2 min sem ativar)
  await db
    .update(extractions)
    .set({ claimedAt: null })
    .where(
      and(
        eq(extractions.userId, auth.user.id),
        eq(extractions.status, "queued"),
        sql`${extractions.claimedAt} IS NOT NULL`,
        sql`${extractions.claimedAt} < NOW() - INTERVAL '2 minutes'`,
      ),
    );

  const jobs = await db
    .select()
    .from(extractions)
    .where(
      and(
        eq(extractions.userId, auth.user.id),
        eq(extractions.status, "queued"),
        isNull(extractions.claimedAt),
      ),
    )
    .orderBy(asc(extractions.iniciadoEm))
    .limit(5);

  return jsonOk({
    jobs: jobs.map((j) => ({
      id: j.id,
      nome: j.nome,
      username: j.perfilAlvoUsername,
      limite: j.limite,
      delay_min_ms: j.delayMinMs,
      delay_max_ms: j.delayMaxMs,
    })),
  });
}
