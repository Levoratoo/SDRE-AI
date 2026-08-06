import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { extractions } from "@/db/schema";
import {
  jsonErro,
  jsonOk,
  readJsonBody,
  requireApiUser,
} from "@/lib/insta-api";

type Body = {
  extraction_id?: string;
  perfil_alvo_pk?: string | number;
  perfil_alvo_full_name?: string;
  perfil_alvo_is_private?: boolean;
  perfil_alvo_seguidores?: number;
};

/** Após a extensão resolver o PK do perfil, ativa o job enfileirado. */
export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const body = await readJsonBody<Body>(req);
  if (!body?.extraction_id || body.perfil_alvo_pk == null) {
    return jsonErro("extraction_id e perfil_alvo_pk são obrigatórios");
  }

  const [row] = await db
    .update(extractions)
    .set({
      status: "running",
      perfilAlvoPk: String(body.perfil_alvo_pk),
      perfilAlvoFullName: (body.perfil_alvo_full_name || "").slice(0, 160) || null,
      perfilAlvoIsPrivate: !!body.perfil_alvo_is_private,
      perfilAlvoSeguidores: Number(body.perfil_alvo_seguidores) || 0,
      claimedAt: new Date(),
      erroMensagem: null,
    })
    .where(
      and(
        eq(extractions.id, body.extraction_id),
        eq(extractions.userId, auth.user.id),
      ),
    )
    .returning();

  if (!row) return jsonErro("Extração não encontrada", 404);

  return jsonOk({
    extraction: {
      id: row.id,
      nome: row.nome,
      status: row.status,
      perfil_alvo_username: row.perfilAlvoUsername,
      perfil_alvo_pk: row.perfilAlvoPk,
      capturados: row.capturados,
      limite: row.limite,
      delay_min_ms: row.delayMinMs,
      delay_max_ms: row.delayMaxMs,
    },
  });
}
