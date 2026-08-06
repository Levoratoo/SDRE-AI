import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { extractions } from "@/db/schema";
import {
  jsonErro,
  jsonOk,
  readJsonBody,
  requireApiUser,
} from "@/lib/insta-api";

type Body = { extraction_id?: string };

/** Reserva um job da fila para a extensão processar. */
export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const body = await readJsonBody<Body>(req);
  if (!body?.extraction_id) return jsonErro("extraction_id obrigatório");

  const [row] = await db
    .update(extractions)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(extractions.id, body.extraction_id),
        eq(extractions.userId, auth.user.id),
        eq(extractions.status, "queued"),
        isNull(extractions.claimedAt),
      ),
    )
    .returning();

  if (!row) {
    return jsonErro("Job indisponível (já reivindicado ou inexistente)", 409);
  }

  return jsonOk({
    job: {
      id: row.id,
      nome: row.nome,
      username: row.perfilAlvoUsername,
      limite: row.limite,
      delay_min_ms: row.delayMinMs,
      delay_max_ms: row.delayMaxMs,
    },
  });
}
