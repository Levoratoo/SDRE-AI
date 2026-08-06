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
  status?: "finished" | "cancelled" | "error";
  erro_mensagem?: string | null;
};

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const body = await readJsonBody<Body>(req);
  if (!body?.extraction_id) return jsonErro("extraction_id obrigatório");

  const status = body.status || "finished";
  if (!["finished", "cancelled", "error"].includes(status)) {
    return jsonErro("status inválido");
  }

  const [extraction] = await db
    .select({ id: extractions.id })
    .from(extractions)
    .where(
      and(
        eq(extractions.id, body.extraction_id),
        eq(extractions.userId, auth.user.id),
      ),
    )
    .limit(1);

  if (!extraction) return jsonErro("Extração não encontrada", 404);

  await db
    .update(extractions)
    .set({
      status,
      erroMensagem: body.erro_mensagem || null,
      finalizadoEm: new Date(),
    })
    .where(eq(extractions.id, extraction.id));

  return jsonOk({ status });
}
