import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { extractions, leads } from "@/db/schema";
import {
  jsonErro,
  jsonOk,
  readJsonBody,
  requireApiUser,
} from "@/lib/insta-api";

type LeadIn = {
  pk?: string | number;
  username?: string;
  full_name?: string;
  is_private?: boolean;
  is_verified?: boolean;
  is_business?: boolean;
};

type Body = {
  extraction_id?: string;
  leads?: LeadIn[];
  max_id?: string | null;
};

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const body = await readJsonBody<Body>(req);
  if (!body?.extraction_id || !Array.isArray(body.leads)) {
    return jsonErro("extraction_id e leads são obrigatórios");
  }

  const [extraction] = await db
    .select()
    .from(extractions)
    .where(
      and(
        eq(extractions.id, body.extraction_id),
        eq(extractions.userId, auth.user.id),
      ),
    )
    .limit(1);

  if (!extraction) return jsonErro("Extração não encontrada", 404);

  let novos = 0;
  let reprocessados = 0;

  for (const lead of body.leads) {
    if (lead.pk == null || !lead.username) continue;
    const pk = String(lead.pk);
    const username = String(lead.username).slice(0, 120);

    const existing = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.userId, auth.user.id), eq(leads.pk, pk)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(leads)
        .set({
          username,
          fullName: (lead.full_name || "").slice(0, 160) || null,
          isPrivate: !!lead.is_private,
          isVerified: !!lead.is_verified,
          isBusiness: !!lead.is_business,
          extractionId: extraction.id,
        })
        .where(eq(leads.id, existing[0].id));
      reprocessados++;
    } else {
      await db.insert(leads).values({
        userId: auth.user.id,
        pk,
        username,
        fullName: (lead.full_name || "").slice(0, 160) || null,
        isPrivate: !!lead.is_private,
        isVerified: !!lead.is_verified,
        isBusiness: !!lead.is_business,
        extractionId: extraction.id,
      });
      novos++;
    }
  }

  const added = novos; // capturados incrementa só novos
  await db
    .update(extractions)
    .set({
      capturados: sql`${extractions.capturados} + ${added}`,
      maxId: body.max_id ?? extraction.maxId,
      status:
        extraction.status === "paused" ? "paused" : "running",
    })
    .where(eq(extractions.id, extraction.id));

  const [updated] = await db
    .select({ capturados: extractions.capturados })
    .from(extractions)
    .where(eq(extractions.id, extraction.id))
    .limit(1);

  return jsonOk({
    novos,
    reprocessados,
    total_capturado: updated?.capturados ?? extraction.capturados + added,
  });
}
