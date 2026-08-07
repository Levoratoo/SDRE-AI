/**
 * Suspende ou reativa conta de cliente.
 *
 * USER_EMAIL=... ACCOUNT_STATUS=suspended ACCOUNT_NOTES="inadimplente" npm run db:account-status
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const email = process.env.USER_EMAIL || process.env.INVITE_EMAIL;
  if (!email) throw new Error("USER_EMAIL obrigatório");

  const statusRaw = (process.env.ACCOUNT_STATUS || "active").toLowerCase();
  const accountStatus =
    statusRaw === "trial" || statusRaw === "suspended" ? statusRaw : "active";
  const notes = process.env.ACCOUNT_NOTES;

  const db = drizzle(neon(url), { schema });

  const [u] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (!u) throw new Error(`Usuário não encontrado: ${email}`);

  await db
    .update(schema.user)
    .set({
      accountStatus: accountStatus as "active" | "trial" | "suspended",
      accountNotes: notes ?? u.accountNotes,
      updatedAt: new Date(),
    })
    .where(eq(schema.user.id, u.id));

  if (accountStatus === "suspended") {
    await db
      .update(schema.campaigns)
      .set({ status: "paused", atualizadoEm: new Date() })
      .where(
        and(eq(schema.campaigns.userId, u.id), eq(schema.campaigns.status, "running")),
      );
    console.log("Campanhas running pausadas.");
  }

  console.log(`Conta ${email} → ${accountStatus}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
