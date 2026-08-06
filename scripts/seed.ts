import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash, randomBytes } from "crypto";
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const db = drizzle(neon(url), { schema });

  const email = process.env.SEED_EMAIL || "levorato157@gmail.com";
  const name = process.env.SEED_NAME || "Pedro";
  const password = process.env.SEED_PASSWORD || "LevoratoProspect2026!";

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

    console.log("Usuário criado:", email);
  } else {
    console.log("Usuário já existe:", email);
  }

  const active = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)))
    .limit(1);

  let apiKeyPlain: string | null = null;
  if (!active[0]) {
    const raw = randomBytes(24).toString("hex");
    apiKeyPlain = `pik_${raw}`;
    await db.insert(schema.apiKeys).values({
      userId,
      keyPrefix: apiKeyPlain.slice(0, 12),
      keyHash: createHash("sha256").update(apiKeyPlain).digest("hex"),
      label: "default",
    });
    console.log("API Key gerada (copie):", apiKeyPlain);
  } else {
    console.log("API Key já existe (prefixo):", active[0].keyPrefix + "…");
  }

  console.log("---");
  console.log("Login:", email);
  console.log("Senha:", isNew ? password : "(já definida — use a atual ou regenerar)");
  if (apiKeyPlain) console.log("API Key:", apiKeyPlain);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
