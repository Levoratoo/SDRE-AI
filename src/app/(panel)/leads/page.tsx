import { desc, eq } from "drizzle-orm";
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
      <h1 className="page-title">Base de leads</h1>
      <p className="page-sub">
        {rows.length.toLocaleString("pt-BR")} leads recentes (máx. 200 nesta
        view).
      </p>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: 22 }}>
            Nenhum lead ainda. Rode uma extração pela extensão.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Nome</th>
                  <th>Sinais</th>
                  <th>Capturado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">@{r.username}</td>
                    <td>{r.fullName || "—"}</td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        {r.isVerified ? (
                          <span className="pill">verificado</span>
                        ) : null}
                        {r.isBusiness ? (
                          <span className="pill">business</span>
                        ) : null}
                        {r.isPrivate ? (
                          <span className="pill">privado</span>
                        ) : (
                          <span className="pill">público</span>
                        )}
                      </span>
                    </td>
                    <td>{fmtDate(r.capturadoEm)}</td>
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
