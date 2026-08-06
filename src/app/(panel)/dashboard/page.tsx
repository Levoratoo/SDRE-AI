import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { extractions, leads } from "@/db/schema";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const userId = session.user.id;

  const [leadsCount] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.userId, userId));

  const [extrCount] = await db
    .select({ value: count() })
    .from(extractions)
    .where(eq(extractions.userId, userId));

  const [running] = await db
    .select({ value: count() })
    .from(extractions)
    .where(
      and(eq(extractions.userId, userId), eq(extractions.status, "running")),
    );

  return (
    <>
      <h1 className="page-title">Olá, {session.user.name}</h1>
      <p className="page-sub">Painel Levorato Prospect</p>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Extrações totais</div>
          <div className="stat-value">{extrCount?.value ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Em andamento</div>
          <div className="stat-value">{running?.value ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Leads na base</div>
          <div className="stat-value">{leadsCount?.value ?? 0}</div>
        </div>
      </div>

      <div className="card">
        <h2>Próximo passo</h2>
        <p className="muted">
          Configure a extensão com a URL do painel e sua API Key para começar a
          extrair seguidores.
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <Link className="btn primary" href="/extensao">
            Configurar extensão
          </Link>
          <Link className="btn secondary" href="/leads">
            Ver leads
          </Link>
        </div>
      </div>
    </>
  );
}
