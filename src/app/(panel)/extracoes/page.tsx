import { desc, eq } from "drizzle-orm";
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
      <h1 className="page-title">Extrações</h1>
      <p className="page-sub">
        Enfileire um @ aqui. Com o worker na VPS Hostinger ligado, a extração
        roda 24/7 mesmo com o PC desligado (precisa ter sincronizado a sessão IG
        uma vez). Sem worker, a extensão no Opera também processa a fila.
      </p>

      <ExtracaoQueueForm />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: 22 }}>
            Nenhuma extração ainda.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil-alvo</th>
                  <th>Seguidores</th>
                  <th>Capturados</th>
                  <th>Status</th>
                  <th>Iniciada</th>
                  <th>Finalizada</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nome}</td>
                    <td className="mono">@{r.perfilAlvoUsername}</td>
                    <td>
                      {(r.perfilAlvoSeguidores || 0).toLocaleString("pt-BR")}
                    </td>
                    <td>{r.capturados.toLocaleString("pt-BR")}</td>
                    <td>
                      <span className={`pill status-${r.status}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                      {r.erroMensagem ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {r.erroMensagem}
                        </div>
                      ) : null}
                    </td>
                    <td>{fmtDate(r.iniciadoEm)}</td>
                    <td>{fmtDate(r.finalizadoEm)}</td>
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
