/**
 * OpenAI server-only helpers.
 * OPENAI_API_KEY must never be imported into client components
 * or returned in API JSON responses.
 */

import "server-only";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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
}): Promise<string> {
  const apiKey = getApiKey();
  const model = getModel();
  const system = (opts.systemPrompt || "").trim() ||
    "Você é um assistente de atendimento no Instagram. Responda em português brasileiro, de forma curta, simpática e objetiva.";

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: 280,
      messages: [
        { role: "system", content: system },
        { role: "user", content: opts.userMessage },
      ],
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
