import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentSettings } from "@/db/schema";
import {
  ensureAgentSettings,
  newVerifyToken,
  newWebhookSecret,
  toPublicAgent,
} from "@/lib/agent";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const action = new URL(req.url).searchParams.get("action") || "get";
  if (action !== "get") {
    return NextResponse.json({ ok: false, erro: "Ação inválida" }, { status: 400 });
  }

  const row = await ensureAgentSettings(session.user.id);
  return NextResponse.json({ ok: true, agente: toPublicAgent(row) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const action = new URL(req.url).searchParams.get("action") || "update";
  const row = await ensureAgentSettings(session.user.id);

  if (action === "regenerate_tokens") {
    const webhookSecret = newWebhookSecret();
    const verifyToken = newVerifyToken();
    const [updated] = await db
      .update(agentSettings)
      .set({
        webhookSecret,
        verifyToken,
        atualizadoEm: new Date(),
      })
      .where(eq(agentSettings.id, row.id))
      .returning();

    const pub = toPublicAgent(updated);
    return NextResponse.json({
      ok: true,
      callback_url: pub.callback_url,
      verify_token: pub.verify_token,
      agente: pub,
    });
  }

  if (action !== "update") {
    return NextResponse.json({ ok: false, erro: "Ação inválida" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ativo?: boolean;
    prompt?: string;
    responder_todos?: boolean;
    responder_prospectados?: boolean;
    meta_ig_business_id?: string;
    meta_access_token?: string;
  };

  // Never accept or echo OpenAI keys from the client.
  const forbidden = ["openai_api_key", "OPENAI_API_KEY", "openaiKey"];
  for (const k of forbidden) {
    if (k in (body as Record<string, unknown>)) {
      return NextResponse.json(
        { ok: false, erro: "Chave OpenAI é apenas do servidor" },
        { status: 400 },
      );
    }
  }

  const patch: Partial<typeof agentSettings.$inferInsert> = {
    atualizadoEm: new Date(),
  };

  if (typeof body.ativo === "boolean") patch.ativo = body.ativo;
  if (typeof body.prompt === "string") patch.prompt = body.prompt.slice(0, 8000);
  if (typeof body.responder_todos === "boolean") {
    patch.responderTodos = body.responder_todos;
  }
  if (typeof body.responder_prospectados === "boolean") {
    patch.responderProspeccao = body.responder_prospectados;
  }
  if (typeof body.meta_ig_business_id === "string") {
    patch.metaIgBusinessId = body.meta_ig_business_id.trim().slice(0, 64) || null;
  }
  if (typeof body.meta_access_token === "string" && body.meta_access_token.trim()) {
    const token = body.meta_access_token.trim();
    if (token.length < 20 || token.length > 800) {
      return NextResponse.json({ ok: false, erro: "Token Meta inválido" }, { status: 400 });
    }
    // Block accidental OpenAI key paste into Meta field
    if (token.startsWith("sk-") || token.startsWith("sk-svcacct-")) {
      return NextResponse.json(
        { ok: false, erro: "Isso parece uma chave OpenAI. Cole o Access Token da Meta." },
        { status: 400 },
      );
    }
    patch.metaAccessToken = token;
  }

  const [updated] = await db
    .update(agentSettings)
    .set(patch)
    .where(eq(agentSettings.id, row.id))
    .returning();

  return NextResponse.json({ ok: true, agente: toPublicAgent(updated) });
}
