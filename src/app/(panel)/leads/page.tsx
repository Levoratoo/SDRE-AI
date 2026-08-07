import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireSession } from "@/lib/session";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default async function LeadsPage() {
  const session = await requireSession();
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.userId, session.user.id))
    .orderBy(desc(leads.capturadoEm))
    .limit(200);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Base de leads</h1>
          <p className="page-sub">
            {rows.length.toLocaleString("pt-BR")} leads recentes (máx. 200 nesta
            view).
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn outline" href="/extracoes">
            + Adicionar leads
          </Link>
          <a className="btn primary" href="/api/leads/export" download>
            Exportar CSV
          </a>
        </div>
      </div>

      <div className="card table-card">
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Nenhum lead ainda. Rode uma extração.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Nome</th>
                  <th>Sinais</th>
                  <th>Status</th>
                  <th>Capturado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a
                        className="action-pink mono"
                        href={`https://instagram.com/${r.username}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        @{r.username}
                      </a>
                    </td>
                    <td>{r.fullName || "—"}</td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        {r.isPrivate ? (
                          <span className="pill signal">privado</span>
                        ) : (
                          <span className="pill">público</span>
                        )}
                        {r.isVerified ? (
                          <span className="pill signal">verificado</span>
                        ) : null}
                        {r.isBusiness ? (
                          <span className="pill">business</span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <span className="pill novo">Novo</span>
                    </td>
                    <td>{fmtDate(r.capturadoEm)}</td>
                    <td>
                      <a
                        className="action-pink"
                        href={`https://instagram.com/${r.username}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    </td>
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
