/**
 * Convida um cliente: user + senha + API key + agent_settings.
 *
 * Uso:
 *   SEED_EMAIL=... SEED_NAME=... SEED_PASSWORD=... ACCOUNT_STATUS=trial npm run db:invite
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash, randomBytes } from "crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";

const DEFAULT_PROMPT =
  "Você é um assistente de vendas simpático e objetivo. Responda em português brasileiro. Seja educado, curto e natural — como uma conversa de Direct. Não invente preços ou promessas. Se não souber algo, diga que vai verificar.";

function newWebhookSecret() {
  return randomBytes(24).toString("hex");
}

function newVerifyToken() {
  return randomBytes(18).toString("hex");
}

async function ensureAgentSettings(
  db: ReturnType<typeof drizzle>,
  userId: string,
) {
  const [existing] = await db
    .select({ id: schema.agentSettings.id })
    .from(schema.agentSettings)
    .where(eq(schema.agentSettings.userId, userId))
    .limit(1);

  if (existing) return;

  await db.insert(schema.agentSettings).values({
    userId,
    webhookSecret: newWebhookSecret(),
    verifyToken: newVerifyToken(),
    prompt: DEFAULT_PROMPT,
    ativo: false,
    responderTodos: false,
    responderProspeccao: true,
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const db = drizzle(neon(url), { schema });

  const email = process.env.SEED_EMAIL || process.env.INVITE_EMAIL;
  const name = process.env.SEED_NAME || process.env.INVITE_NAME || "Cliente";
  const password =
    process.env.SEED_PASSWORD ||
    process.env.INVITE_PASSWORD ||
    randomBytes(9).toString("base64url") + "A1!";
  const notes = process.env.ACCOUNT_NOTES || "";
  const statusRaw = (process.env.ACCOUNT_STATUS || "active").toLowerCase();
  const accountStatus =
    statusRaw === "trial" || statusRaw === "suspended" ? statusRaw : "active";

  if (!email) throw new Error("INVITE_EMAIL ou SEED_EMAIL obrigatório");

  const panelUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "https://sdre-ai.vercel.app";

  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  let userId = existing[0]?.id;
  const isNew = !userId;

  if (!userId) {
    userId = randomBytes(16).toString("hex");
    const now = new Date();
    await db.insert(schema.user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      accountStatus: accountStatus as "active" | "trial" | "suspended",
      accountNotes: notes || null,
      createdAt: now,
      updatedAt: now,
    });

    const hashed = await hashPassword(password);
    await db.insert(schema.account).values({
      id: randomBytes(16).toString("hex"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(schema.user)
      .set({
        accountStatus: accountStatus as "active" | "trial" | "suspended",
        accountNotes: notes || existing[0]?.accountNotes,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, userId));
  }

  await ensureAgentSettings(db, userId);

  const activeKey = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)),
    )
    .limit(1);

  let apiKeyPlain: string | null = null;
  if (!activeKey[0]) {
    const raw = randomBytes(24).toString("hex");
    apiKeyPlain = `pik_${raw}`;
    await db.insert(schema.apiKeys).values({
      userId,
      keyPrefix: apiKeyPlain.slice(0, 12),
      keyHash: createHash("sha256").update(apiKeyPlain).digest("hex"),
      label: "default",
    });
  }

  console.log("=== Cliente provisionado ===");
  console.log("Painel:", panelUrl);
  console.log("Email:", email);
  console.log("Senha:", isNew ? password : "(existente — use a atual ou defina INVITE_PASSWORD)");
  console.log("Status:", accountStatus);
  if (apiKeyPlain) console.log("API Key (extensão opcional):", apiKeyPlain);
  console.log("");
  console.log("Checklist para o cliente:");
  console.log("1. Login no painel");
  console.log("2. Minha Conta → colar sessionid do Instagram");
  console.log("3. Extrações → enfileirar @");
  console.log("4. Campanhas → criar + Play");
  console.log("5. (Opcional) Agente IA → token Meta + webhook no Facebook");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
