/**
 * Testes de contrato das APIs da extensão / fila do painel.
 * Uso: API_KEY=pik_... npx tsx scripts/test-api.ts
 * (ou lê do .env.local SEED se houver chave em args)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const KEY = process.env.API_KEY || process.argv[2];

if (!KEY) {
  console.error("Passe API_KEY=pik_... ou argumento");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

let failed = 0;

async function call(
  name: string,
  path: string,
  init?: RequestInit,
  expectOk = true,
) {
  const url = BASE + path;
  const r = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
  const text = await r.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`FAIL ${name}: não-JSON HTTP ${r.status}`, text.slice(0, 200));
    failed++;
    return null;
  }
  const ok = json.ok === true;
  if (expectOk && !ok) {
    console.error(`FAIL ${name}:`, json);
    failed++;
    return json;
  }
  console.log(`OK   ${name}`, JSON.stringify(json).slice(0, 180));
  return json;
}

async function main() {
  console.log("BASE", BASE);

  await call("ping.php", "/api/insta/ping.php");
  await call("ping", "/api/insta/ping");

  await call("session_sync", "/api/insta/session_sync.php", {
    method: "POST",
    body: JSON.stringify({
      sessionid: "audit_sid",
      csrftoken: "tok",
      ds_user_id: "42",
      ig_username: "audit_user",
      ig_user_pk: 42,
      user_agent: "test",
    }),
  });

  // Simula fila do painel via bearer: cria via start+hack — usamos extractions_start
  // e também testamos queue endpoints com job criado via SQL-like start then
  // For queue we need status queued — create through activate path:
  // Use internal: insert via start then we can't set queued easily.
  // Test queue empty first:
  const q0 = await call("extractions_queue", "/api/insta/extractions_queue.php");
  if (!q0 || !Array.isArray(q0.jobs)) {
    console.error("FAIL queue shape");
    failed++;
  }

  const start = await call("extractions_start", "/api/insta/extractions_start.php", {
    method: "POST",
    body: JSON.stringify({
      perfil_alvo_username: "audit_alvo",
      perfil_alvo_pk: "777",
      perfil_alvo_full_name: "Audit",
      perfil_alvo_seguidores: 100,
      nome: "Audit start",
    }),
  });
  const eid = (start as { extraction?: { id?: string } } | null)?.extraction?.id;
  if (!eid) {
    console.error("FAIL sem extraction id");
    process.exit(1);
  }

  const batch = await call("extractions_batch", "/api/insta/extractions_batch.php", {
    method: "POST",
    body: JSON.stringify({
      extraction_id: eid,
      max_id: "m1",
      leads: [
        {
          pk: 9001,
          username: "audit_lead_1",
          full_name: "L1",
          is_private: false,
          is_verified: false,
          is_business: false,
        },
        {
          pk: 9002,
          username: "audit_lead_2",
          full_name: "L2",
          is_private: true,
          is_verified: true,
          is_business: false,
        },
      ],
    }),
  });
  if (batch && (batch.novos as number) < 1) {
    console.error("FAIL batch sem novos");
    failed++;
  }

  await call("extractions_pause", "/api/insta/extractions_pause.php", {
    method: "POST",
    body: JSON.stringify({ extraction_id: eid, max_id: "m1" }),
  });

  await call("extractions_finish", "/api/insta/extractions_finish.php", {
    method: "POST",
    body: JSON.stringify({ extraction_id: eid, status: "finished" }),
  });

  await call("campanhas list_active", "/api/insta/campanhas_callback.php?action=list_active");

  // Fila painel → claim → activate (simula extensão)
  const { neon } = await import("@neondatabase/serverless");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing for queue test");
  const sql = neon(dbUrl);
  const pingUser = await call("ping for user", "/api/insta/ping");
  const userId = (pingUser as { usuario?: { id?: string } } | null)?.usuario?.id;
  if (!userId) throw new Error("sem user id");

  const inserted = await sql`
    INSERT INTO extractions (
      user_id, nome, perfil_alvo_username, perfil_alvo_pk, status, capturados, limite, delay_min_ms, delay_max_ms
    ) VALUES (
      ${userId}, 'Audit fila', 'perfil_fila_audit', '0', 'queued', 0, 50, 2200, 4800
    ) RETURNING id
  `;
  const qid = inserted[0].id as string;
  console.log("queued id", qid);

  const q1 = await call("queue lists job", "/api/insta/extractions_queue.php");
  const jobs = (q1 as { jobs?: { id: string }[] } | null)?.jobs || [];
  if (!jobs.some((j) => j.id === qid)) {
    console.error("FAIL job não listado na fila");
    failed++;
  }

  await call("claim", "/api/insta/extractions_claim.php", {
    method: "POST",
    body: JSON.stringify({ extraction_id: qid }),
  });

  // segunda claim deve falhar
  await call(
    "claim duplicate",
    "/api/insta/extractions_claim.php",
    {
      method: "POST",
      body: JSON.stringify({ extraction_id: qid }),
    },
    false,
  );

  await call("activate", "/api/insta/extractions_activate.php", {
    method: "POST",
    body: JSON.stringify({
      extraction_id: qid,
      perfil_alvo_pk: "555",
      perfil_alvo_full_name: "Fila Audit",
      perfil_alvo_seguidores: 10,
    }),
  });

  await call("finish queued job", "/api/insta/extractions_finish.php", {
    method: "POST",
    body: JSON.stringify({ extraction_id: qid, status: "finished" }),
  });

  // CRX / ZIP estáticos
  for (const asset of ["/levorato-prospect.crx", "/levorato-prospect-extension.zip"]) {
    const r = await fetch(BASE + asset);
    if (!r.ok || Number(r.headers.get("content-length") || 0) < 100) {
      // content-length may be missing; check body
      const buf = await r.arrayBuffer();
      if (!r.ok || buf.byteLength < 100) {
        console.error(`FAIL asset ${asset}: HTTP ${r.status} size=${buf.byteLength}`);
        failed++;
      } else {
        console.log(`OK   asset ${asset} (${buf.byteLength} bytes)`);
      }
    } else {
      console.log(`OK   asset ${asset}`);
    }
  }

  if (failed) {
    console.error(`\n${failed} falha(s)`);
    process.exit(1);
  }
  console.log("\nTodos os testes passaram.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
