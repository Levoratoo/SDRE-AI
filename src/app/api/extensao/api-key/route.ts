import { NextResponse } from "next/server";
import {
  createApiKeyForUser,
  getActiveApiKeyMeta,
  regenerateApiKeyForUser,
} from "@/lib/api-key";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const meta = await getActiveApiKeyMeta(session.user.id);
  return NextResponse.json({
    ok: true,
    key: meta
      ? {
          prefix: meta.keyPrefix,
          createdAt: meta.createdAt,
          lastUsedAt: meta.lastUsedAt,
          hasKey: true,
        }
      : { hasKey: false },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { regenerate?: boolean };
  const plain = body.regenerate
    ? await regenerateApiKeyForUser(session.user.id)
    : (await getActiveApiKeyMeta(session.user.id))
      ? await regenerateApiKeyForUser(session.user.id)
      : await createApiKeyForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    apiKey: plain,
    aviso: "Copie agora — a chave completa não será exibida de novo.",
  });
}
