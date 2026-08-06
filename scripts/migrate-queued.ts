import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const sql = neon(url);

  await sql`DO $$ BEGIN
    ALTER TYPE extraction_status ADD VALUE IF NOT EXISTS 'queued';
  EXCEPTION WHEN others THEN NULL;
  END $$;`;

  await sql`ALTER TABLE extractions ADD COLUMN IF NOT EXISTS limite integer`;
  await sql`ALTER TABLE extractions ADD COLUMN IF NOT EXISTS delay_min_ms integer`;
  await sql`ALTER TABLE extractions ADD COLUMN IF NOT EXISTS delay_max_ms integer`;
  await sql`ALTER TABLE extractions ADD COLUMN IF NOT EXISTS claimed_at timestamptz`;
  await sql`ALTER TABLE extractions ALTER COLUMN perfil_alvo_pk SET DEFAULT '0'`;

  console.log("migrate-queued: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
