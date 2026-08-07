"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Stats = {
  extracoes: number;
  emAndamento: number;
  campanhasRodando: number;
  leads: number;
};

type Extracao = {
  id: string;
  perfilAlvoUsername: string;
  capturados: number;
  status: string;
  iniciadoEm: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em andamento",
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

export function DashboardLive({
  firstName,
  initialStats,
  initialLatest,
}: {
  firstName: string;
  initialStats: Stats;
  initialLatest: Extracao[];
}) {
  const [stats, setStats] = useState(initialStats);
  const [latest, setLatest] = useState(initialLatest);
  const active =
    stats.emAndamento > 0 || stats.campanhasRodando > 0;

  const load = useCallback(async () => {
    const r = await fetch("/api/painel/resumo", { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) return;
    setStats(j.stats);
    setLatest(j.ultimasExtracoes);
  }, []);

  useEffect(() => {
    void load();
    const ms = active ? 4000 : 15000;
    const t = setInterval(() => {
      void load();
    }, ms);
    return () => clearInterval(t);
  }, [load, active]);

  return (
    <>
      <div className="dash-top">
        <div>
          <h1 className="page-title gradient-text">Olá, {firstName}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Um resumo rápido da sua operação
            {active ? " · atualizando ao vivo" : ""}.
          </p>
        </div>
        <div className="dash-actions">
          <Link
            className="btn secondary small"
            href="/tutorial?p=dashboard"
            target="_blank"
            rel="noopener"
          >
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
            {stats.extracoes.toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Em andamento agora</div>
          <div className="stat-value">
            {stats.emAndamento.toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Campanhas rodando</div>
          <div className="stat-value">
            {stats.campanhasRodando.toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="stat featured">
          <div className="stat-label">Leads na base</div>
          <div className="stat-value">
            {stats.leads.toLocaleString("pt-BR")}
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
