import "server-only";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSettings } from "@/db/schema";

const DEFAULT_PROMPT =
  "Você é um assistente de vendas simpático e objetivo. Responda em português brasileiro. Seja educado, curto e natural — como uma conversa de Direct. Não invente preços ou promessas. Se não souber algo, diga que vai verificar.";

export function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function newWebhookSecret() {
  return randomBytes(24).toString("hex");
}

export function newVerifyToken() {
  return randomBytes(18).toString("hex");
}

export function callbackUrlFor(webhookSecret: string) {
  return `${appBaseUrl()}/api/insta/webhook/${webhookSecret}`;
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 10) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function ensureAgentSettings(userId: string) {
  const [existing] = await db
    .select()
    .from(agentSettings)
    .where(eq(agentSettings.userId, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(agentSettings)
    .values({
      userId,
      webhookSecret: newWebhookSecret(),
      verifyToken: newVerifyToken(),
      prompt: DEFAULT_PROMPT,
      ativo: false,
      responderTodos: false,
      responderProspeccao: true,
    })
    .returning();

  return created;
}

export function toPublicAgent(row: typeof agentSettings.$inferSelect) {
  // Never expose OpenAI key or full Meta access token.
  return {
    ativo: row.ativo,
    prompt: row.prompt || DEFAULT_PROMPT,
    responder_todos: row.responderTodos,
    responder_prospectados: row.responderProspeccao,
    callback_url: callbackUrlFor(row.webhookSecret),
    verify_token: row.verifyToken,
    meta_ig_business_id: row.metaIgBusinessId || "",
    has_meta_access_token: Boolean(row.metaAccessToken),
    meta_access_token_mask: maskSecret(row.metaAccessToken),
    total_mensagens: row.totalMensagens,
    ultima_msg_em: row.ultimaMsgEm?.toISOString() ?? null,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  };
}
