/**
 * OpenAI server-only helpers.
 * OPENAI_API_KEY must never be imported into client components
 * or returned in API JSON responses.
 */

import "server-only";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY não configurada no servidor");
  }
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export async function generateAgentReply(opts: {
  systemPrompt: string;
  userMessage: string;
  history?: ChatTurn[];
}): Promise<string> {
  const apiKey = getApiKey();
  const model = getModel();
  const system =
    (opts.systemPrompt || "").trim() ||
    "Você é um assistente de atendimento no Instagram. Responda em português brasileiro, de forma curta, simpática e objetiva. Continue a conversa com naturalidade, sem repetir a mesma abordagem.";

  const history = (opts.history || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 900) }));

  const messages: ChatTurn[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: opts.userMessage.slice(0, 900) },
  ];

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      max_tokens: 280,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI retornou resposta vazia");
  return text.slice(0, 900);
}
