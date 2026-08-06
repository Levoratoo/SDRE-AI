import { db } from "@/db";
import { extractions } from "@/db/schema";
import {
  jsonErro,
  jsonOk,
  readJsonBody,
  requireApiUser,
} from "@/lib/insta-api";

type Body = {
  perfil_alvo_username?: string;
  perfil_alvo_pk?: string | number;
  perfil_alvo_full_name?: string;
  perfil_alvo_is_private?: boolean;
  perfil_alvo_seguidores?: number;
  nome?: string;
};

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const body = await readJsonBody<Body>(req);
  if (!body?.perfil_alvo_username || body.perfil_alvo_pk == null) {
    return jsonErro("perfil_alvo_username e perfil_alvo_pk são obrigatórios");
  }

  const nome =
    (body.nome || "").trim() || `@${body.perfil_alvo_username}`;

  const [row] = await db
    .insert(extractions)
    .values({
      userId: auth.user.id,
      nome: nome.slice(0, 160),
      perfilAlvoUsername: String(body.perfil_alvo_username).slice(0, 120),
      perfilAlvoPk: String(body.perfil_alvo_pk),
      perfilAlvoFullName: (body.perfil_alvo_full_name || "").slice(0, 160) || null,
      perfilAlvoIsPrivate: !!body.perfil_alvo_is_private,
      perfilAlvoSeguidores: Number(body.perfil_alvo_seguidores) || 0,
      status: "running",
      capturados: 0,
    })
    .returning();

  return jsonOk({
    extraction: {
      id: row.id,
      nome: row.nome,
      status: row.status,
      perfil_alvo_username: row.perfilAlvoUsername,
      perfil_alvo_pk: row.perfilAlvoPk,
      capturados: row.capturados,
      iniciado_em: row.iniciadoEm,
    },
  });
}
