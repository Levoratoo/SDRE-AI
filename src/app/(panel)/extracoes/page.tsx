import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ExtracaoActions } from "@/components/extracao-actions";
import { ExtracaoQueueForm } from "@/components/extracao-queue-form";
import { db } from "@/db";
import { extractions } from "@/db/schema";
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
  running: "Rodando",
  paused: "Pausada",
  finished: "Concluída",
  cancelled: "Cancelada",
  error: "Erro",
};

function progressOf(r: {
  capturados: number;
  perfilAlvoSeguidores: number | null;
  limite: number | null;
  status: string;
}) {
  const meta =
    r.limite && r.limite > 0
      ? r.limite
      : r.perfilAlvoSeguidores && r.perfilAlvoSeguidores > 0
        ? r.perfilAlvoSeguidores
        : null;
  if (!meta) {
    return r.status === "finished" ? 100 : r.capturados > 0 ? 8 : 0;
  }
  return Math.min(100, Math.round((r.capturados / meta) * 100));
}

export default async function ExtracoesPage() {
  const session = await requireSession();
  const rows = await db
    .select()
    .from(extractions)
    .where(eq(extractions.userId, session.user.id))
    .orderBy(desc(extractions.iniciadoEm))
    .limit(100);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Extrações</h1>
          <p className="page-sub">
            Extraia seguidores de perfis do Instagram. Enfileire abaixo — o
            worker na VPS processa 24/7 mesmo com o PC desligado.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn primary" href="#nova-extracao">
            Enfileirar @
          </Link>
        </div>
      </div>

      <div id="nova-extracao">
        <ExtracaoQueueForm />
      </div>

      <div className="card table-card">
        <div className="section-head">
          <h2>Histórico</h2>
        </div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: 14 }}>
            Nenhuma extração ainda.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Perfil-alvo</th>
                  <th>Seguidores</th>
                  <th>Capturados</th>
                  <th>Progresso</th>
                  <th>Status</th>
                  <th>Iniciada</th>
                  <th>Finalizada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = progressOf(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="mono" style={{ color: "#fff" }}>
                          @{r.perfilAlvoUsername}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.nome}
                        </div>
                      </td>
                      <td>
                        {(r.perfilAlvoSeguidores || 0).toLocaleString("pt-BR")}
                      </td>
                      <td>{r.capturados.toLocaleString("pt-BR")}</td>
                      <td>
                        <div className="progress">
                          <div className="progress-bar">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          <div className="progress-pct">{pct}%</div>
                        </div>
                      </td>
                      <td>
                        <span className={`pill status-${r.status}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                        {r.erroMensagem ? (
                          <div
                            className="muted"
                            style={{ fontSize: 12, marginTop: 4, maxWidth: 220 }}
                          >
                            {r.erroMensagem.slice(0, 80)}
                          </div>
                        ) : null}
                      </td>
                      <td>{fmtDate(r.iniciadoEm)}</td>
                      <td>{fmtDate(r.finalizadoEm)}</td>
                      <td>
                        <ExtracaoActions
                          id={r.id}
                          canDelete={
                            r.status !== "running" && r.status !== "queued"
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
