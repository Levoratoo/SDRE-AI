import { and, count, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { extractions, leads } from "@/db/schema";
import { requireSession } from "@/lib/session";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em andamento",
  paused: "Pausada",
  finished: "Concluída",
  cancelled: "Cancelada",
  error: "Erro",
};

export default async function DashboardPage() {
  const session = await requireSession();
  const userId = session.user.id;
  const firstName = (session.user.name || "olá").split(" ")[0];

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
      and(
        eq(extractions.userId, userId),
        inArray(extractions.status, ["running", "queued"]),
      ),
    );

  const latest = await db
    .select()
    .from(extractions)
    .where(eq(extractions.userId, userId))
    .orderBy(desc(extractions.iniciadoEm))
    .limit(8);

  return (
    <>
      <div className="dash-top">
        <div>
          <h1 className="page-title gradient-text">Olá, {firstName}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Um resumo rápido da sua operação.
          </p>
        </div>
        <div className="dash-actions">
          <Link className="btn secondary small" href="/extensao">
            Ver tutorial
          </Link>
          <Link className="btn primary" href="/extracoes">
            Começar agora
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Extrações totais</div>
          <div className="stat-value">
            {(extrCount?.value ?? 0).toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Em andamento agora</div>
          <div className="stat-value">
            {(running?.value ?? 0).toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="stat featured">
          <div className="stat-label">Leads na base</div>
          <div className="stat-value">
            {(leadsCount?.value ?? 0).toLocaleString("pt-BR")}
          </div>
        </div>
      </div>

      <div className="card table-card">
        <div className="section-head">
          <h2>Últimas extrações</h2>
          <Link className="link-accent" href="/extracoes">
            Ver todas
          </Link>
        </div>

        {latest.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nenhuma extração ainda. Clique em <strong>Começar agora</strong>{" "}
            para enfileirar um @.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Perfil-alvo</th>
                  <th>Capturados</th>
                  <th>Status</th>
                  <th>Iniciada em</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">@{r.perfilAlvoUsername}</td>
                    <td>{r.capturados.toLocaleString("pt-BR")}</td>
                    <td>
                      <span className={`pill status-${r.status}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td>{fmtDate(r.iniciadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
