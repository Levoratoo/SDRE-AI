"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Lead = {
  id: string;
  username: string;
  fullName: string | null;
  isPrivate: boolean | null;
  isVerified: boolean | null;
  isBusiness: boolean | null;
  capturadoEm: string;
  status_disparo: "novo" | "enviado" | "falhou";
};

const STATUS_LABEL = {
  novo: "Novo",
  enviado: "Enviado",
  falhou: "Falhou",
} as const;

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(d));
}

export function LeadsClient({
  initialExtractionId,
}: {
  initialExtractionId?: string;
}) {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
    });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (initialExtractionId) params.set("extraction_id", initialExtractionId);
    const r = await fetch(`/api/leads?${params}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || "Erro");
    setItems(j.leads);
    setTotal(j.total);
    setSelected(new Set());
    setLoading(false);
  }, [page, q, status, initialExtractionId]);

  useEffect(() => {
    load().catch((e) => {
      setErr(e instanceof Error ? e.message : "Erro");
      setLoading(false);
    });
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeSelected() {
    if (!selected.size) return;
    if (!confirm(`Excluir ${selected.size} lead(s)?`)) return;
    const r = await fetch("/api/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const j = await r.json();
    if (!j.ok) {
      setErr(j.erro || "Erro");
      return;
    }
    setOk(`${j.removidos} removido(s)`);
    await load();
  }

  async function importManual() {
    const usernames = manual
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const r = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames }),
    });
    const j = await r.json();
    if (!j.ok) {
      setErr(j.erro || "Erro");
      return;
    }
    setOk(`${j.inseridos} lead(s) importado(s)`);
    setManual("");
    setShowManual(false);
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Base de leads</h1>
          <p className="page-sub">
            {total.toLocaleString("pt-BR")} leads
            {initialExtractionId ? " nesta extração" : ""}.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn outline"
            onClick={() => setShowManual((v) => !v)}
          >
            + Adicionar leads
          </button>
          <Link className="btn secondary" href="/extracoes">
            Extrair
          </Link>
          <a className="btn primary" href="/api/leads/export" download>
            Exportar CSV
          </a>
        </div>
      </div>

      {err ? <div className="alert danger">{err}</div> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      {showManual ? (
        <div className="card">
          <h2>Importar usernames</h2>
          <p className="muted">Um por linha ou separados por vírgula.</p>
          <textarea
            rows={6}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={"usuario1\nusuario2"}
          />
          <button type="button" className="btn primary" onClick={() => void importManual()}>
            Importar
          </button>
        </div>
      ) : null}

      <div className="card filter-bar">
        <input
          placeholder="Buscar username ou nome"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Todos os status</option>
          <option value="novo">Novo</option>
          <option value="enviado">Enviado</option>
          <option value="falhou">Falhou</option>
        </select>
        {selected.size > 0 ? (
          <button type="button" className="btn outline" onClick={() => void removeSelected()}>
            Excluir ({selected.size})
          </button>
        ) : null}
      </div>

      <div className="card table-card">
        {loading ? (
          <p className="muted" style={{ padding: 16 }}>
            Carregando…
          </p>
        ) : items.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Nenhum lead encontrado.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Usuário</th>
                  <th>Nome</th>
                  <th>Sinais</th>
                  <th>Status</th>
                  <th>Capturado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
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
                        {r.isBusiness ? <span className="pill">business</span> : null}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${r.status_disparo}`}>
                        {STATUS_LABEL[r.status_disparo]}
                      </span>
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
        <div className="row" style={{ padding: 12, gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn secondary small"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="muted">Página {page}</span>
          <button
            type="button"
            className="btn secondary small"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </div>
    </>
  );
}
