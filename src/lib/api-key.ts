import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, user } from "@/db/schema";

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET não configurada");
  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptApiKey(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

export function generateApiKeyPlain(): {
  plain: string;
  prefix: string;
  hash: string;
  encrypted: string;
} {
  const raw = randomBytes(24).toString("hex");
  const plain = `pik_${raw}`;
  const prefix = plain.slice(0, 12);
  const hash = hashApiKey(plain);
  const encrypted = encryptApiKey(plain);
  return { plain, prefix, hash, encrypted };
}

export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export async function createApiKeyForUser(userId: string) {
  const { plain, prefix, hash, encrypted } = generateApiKeyPlain();
  await db.insert(apiKeys).values({
    userId,
    keyPrefix: prefix,
    keyHash: hash,
    keyEncrypted: encrypted,
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
      keyEncrypted: apiKeys.keyEncrypted,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function revealApiKeyForUser(userId: string): Promise<string | null> {
  const meta = await getActiveApiKeyMeta(userId);
  if (!meta?.keyEncrypted) return null;
  return decryptApiKey(meta.keyEncrypted);
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
