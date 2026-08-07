import { NextResponse } from "next/server";
import {
  createApiKeyForUser,
  getActiveApiKeyMeta,
  regenerateApiKeyForUser,
  revealApiKeyForUser,
} from "@/lib/api-key";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const reveal = new URL(req.url).searchParams.get("reveal") === "1";
  const meta = await getActiveApiKeyMeta(session.user.id);

  if (reveal) {
    if (!meta) {
      return NextResponse.json(
        { ok: false, erro: "Nenhuma chave ativa" },
        { status: 404 },
      );
    }
    const apiKey = await revealApiKeyForUser(session.user.id);
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "Esta chave foi criada antes do recurso de cópia. Gere uma nova chave e copie.",
          needsRegenerate: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, apiKey });
  }

  return NextResponse.json({
    ok: true,
    key: meta
      ? {
          prefix: meta.keyPrefix,
          createdAt: meta.createdAt,
          lastUsedAt: meta.lastUsedAt,
          hasKey: true,
          canReveal: Boolean(meta.keyEncrypted),
        }
      : { hasKey: false, canReveal: false },
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
    aviso: "Chave gerada — use Copiar chave quando precisar.",
  });
}
