"use client";

import { useCallback, useEffect, useState } from "react";
import { ExtracaoActions } from "@/components/extracao-actions";

type Row = {
  id: string;
  nome: string;
  perfilAlvoUsername: string;
  perfilAlvoSeguidores: number | null;
  capturados: number;
  limite: number | null;
  status: string;
  erroMensagem: string | null;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Rodando",
  paused: "Pausada",
  finished: "Concluída",
  cancelled: "Cancelada",
  error: "Erro",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function progressOf(r: Row) {
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

function isActive(status: string) {
  return status === "queued" || status === "running";
}

export function ExtracoesLive({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [live, setLive] = useState(initial.some((r) => isActive(r.status)));

  const load = useCallback(async () => {
    const r = await fetch("/api/extracoes", { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) return;
    const list = j.extracoes as Row[];
    setRows(list);
    setLive(list.some((x) => isActive(x.status)));
  }, []);

  useEffect(() => {
    setRows(initial);
    setLive(initial.some((r) => isActive(r.status)));
  }, [initial]);

  useEffect(() => {
    const onQueued = () => {
      void load();
    };
    window.addEventListener("extracao-enfileirada", onQueued);
    return () => window.removeEventListener("extracao-enfileirada", onQueued);
  }, [load]);

  useEffect(() => {
    // Sempre dá um refresh rápido ao abrir a aba
    void load();
    const ms = live ? 3000 : 12000;
    const t = setInterval(() => {
      void load();
    }, ms);
    return () => clearInterval(t);
  }, [load, live]);

  return (
    <div className="card table-card">
      <div className="section-head">
        <h2>Histórico</h2>
        {live ? (
          <span className="pill status-running" title="Atualizando ao vivo">
            Ao vivo
          </span>
        ) : null}
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
                        canDelete={!isActive(r.status)}
                        onDeleted={() => void load()}
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
  );
}
