import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, user } from "@/db/schema";

export function generateApiKeyPlain(): { plain: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("hex");
  const plain = `pik_${raw}`;
  const prefix = plain.slice(0, 12);
  const hash = hashApiKey(plain);
  return { plain, prefix, hash };
}

export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export async function createApiKeyForUser(userId: string) {
  const { plain, prefix, hash } = generateApiKeyPlain();
  await db.insert(apiKeys).values({
    userId,
    keyPrefix: prefix,
    keyHash: hash,
    label: "default",
  });
  return plain;
}

export async function regenerateApiKeyForUser(userId: string) {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  return createApiKeyForUser(userId);
}

export async function getActiveApiKeyMeta(userId: string) {
  const rows = await db
    .select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveUserFromBearer(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const plain = authHeader.slice(7).trim();
  if (!plain.startsWith("pik_")) return null;
  const hash = hashApiKey(plain);
  const rows = await db
    .select({
      userId: apiKeys.userId,
      keyId: apiKeys.id,
      nome: user.name,
      email: user.email,
    })
    .from(apiKeys)
    .innerJoin(user, eq(user.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.keyId));

  return {
    id: row.userId,
    nome: row.nome,
    email: row.email,
  };
}
