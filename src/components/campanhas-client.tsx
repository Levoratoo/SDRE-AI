"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Msg = { id: string; titulo: string; texto: string };
type Campanha = {
  id: string;
  nome: string;
  status: string;
  total: number;
  enviados: number;
  erros: number;
  minDelayMin: number;
  maxDelayMin: number;
  seguir: boolean;
};

const STATUS: Record<string, string> = {
  draft: "Rascunho",
  running: "Rodando",
  paused: "Pausada",
  finished: "Concluída",
  cancelled: "Cancelada",
};

export function CampanhasClient({ leadsCount }: { leadsCount: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [items, setItems] = useState<Campanha[]>([]);
  const [nome, setNome] = useState("");
  const [messageId, setMessageId] = useState("");
  const [limiteLeads, setLimiteLeads] = useState("100");
  const [minDelay, setMinDelay] = useState("3");
  const [maxDelay, setMaxDelay] = useState("8");
  const [seguir, setSeguir] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([
      fetch("/api/mensagens?tipo=dm").then((r) => r.json()),
      fetch("/api/campanhas").then((r) => r.json()),
    ]);
    if (m.ok) {
      setMsgs(m.mensagens);
      setMessageId((prev) => prev || m.mensagens[0]?.id || "");
    }
    if (c.ok) setItems(c.campanhas);
  }, []);

  useEffect(() => {
    load().catch(() => setErr("Falha ao carregar"));
    const t = setInterval(() => {
      load().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          messageId,
          allLeads: true,
          limiteLeads: Number(limiteLeads) || 100,
          minDelayMin: Number(minDelay) || 3,
          maxDelayMin: Number(maxDelay) || 8,
          seguir,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setOk(`Campanha criada com ${j.campanha.total} leads.`);
      setNome("");
      setShowForm(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function action(id: string, actionName: string) {
    setBusyId(id);
    setErr(null);
    setOk(null);
    try {
      const r = await fetch(`/api/campanhas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setOk(j.aviso || "Atualizado");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir campanha?")) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/campanhas/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Campanhas de Direct</h1>
          <p className="page-sub">
            Crie a fila e aperte Play — o worker na VPS dispara 24/7.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowForm((v) => !v)}
          >
            Criar campanha
          </button>
        </div>
      </div>

      {err ? <div className="alert danger">{err}</div> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      {showForm ? (
        <div className="card">
          <h2>Nova campanha</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Base atual: <strong>{leadsCount.toLocaleString("pt-BR")}</strong>{" "}
            leads.
          </p>
          {msgs.length === 0 ? (
            <p className="err">
              Crie uma mensagem em <a className="action-pink" href="/mensagens">Mensagens</a> antes.
            </p>
          ) : (
            <form onSubmit={onCreate}>
              <div className="field">
                <label htmlFor="nome">Nome da campanha</label>
                <input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="ex: Envios Box Talent"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="msg">Mensagens</label>
                <select
                  id="msg"
                  value={messageId}
                  onChange={(e) => setMessageId(e.target.value)}
                  required
                >
                  {msgs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.titulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="limite">Quantidade de leads</label>
                <input
                  id="limite"
                  type="number"
                  min={1}
                  max={5000}
                  value={limiteLeads}
                  onChange={(e) => setLimiteLeads(e.target.value)}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div className="field">
                  <label htmlFor="min">Delay mín (min)</label>
                  <input
                    id="min"
                    type="number"
                    min={1}
                    value={minDelay}
                    onChange={(e) => setMinDelay(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="max">Delay máx (min)</label>
                  <input
                    id="max"
                    type="number"
                    min={1}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(e.target.value)}
                  />
                </div>
              </div>
              <label className="row" style={{ marginBottom: 14, gap: 8 }}>
                <input
                  type="checkbox"
                  checked={seguir}
                  onChange={(e) => setSeguir(e.target.checked)}
                />
                <span>
                  <strong>SEGUIR PERFIL</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Segue o lead após enviar o DM
                  </div>
                </span>
              </label>
              <button
                className="btn primary"
                type="submit"
                disabled={loading || !messageId}
              >
                {loading ? "Criando…" : "Salvar campanha"}
              </button>
            </form>
          )}
        </div>
      ) : null}

      <div className="section-head" style={{ marginTop: 8 }}>
        <h2 style={{ margin: 0 }}>Minhas campanhas</h2>
        <button type="button" className="action-pink" onClick={() => load()}>
          Atualizar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nenhuma campanha ainda.
          </p>
        </div>
      ) : (
        <div className="campaign-list">
          {items.map((c) => (
            <div key={c.id} className="campaign-card">
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{c.nome}</div>
                <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                  <span className={`pill status-${c.status}`}>
                    {STATUS[c.status] || c.status}
                  </span>
                  {c.seguir ? <span className="pill">Follow</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Delays: {c.minDelayMin}–{c.maxDelayMin} min · 1 mensagem
                </div>
              </div>
              <div className="campaign-metrics">
                <div>
                  <div className="lbl">Total</div>
                  <div className="val">{c.total}</div>
                </div>
                <div>
                  <div className="lbl">Enviados</div>
                  <div className="val">{c.enviados}</div>
                </div>
                <div>
                  <div className="lbl">Erros</div>
                  <div className="val">{c.erros}</div>
                </div>
              </div>
              <div className="campaign-actions">
                {(c.status === "draft" || c.status === "paused") && (
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={busyId === c.id}
                    onClick={() =>
                      action(c.id, c.status === "draft" ? "start" : "resume")
                    }
                  >
                    {c.status === "draft" ? "Iniciar" : "Retomar"}
                  </button>
                )}
                {c.status === "running" && (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={busyId === c.id}
                    onClick={() => action(c.id, "pause")}
                  >
                    Pausar
                  </button>
                )}
                {(c.status === "running" ||
                  c.status === "paused" ||
                  c.status === "draft") && (
                  <button
                    type="button"
                    className="btn outline small"
                    disabled={busyId === c.id}
                    onClick={() => action(c.id, "cancel")}
                  >
                    Cancelar
                  </button>
                )}
                {c.status !== "running" && (
                  <button
                    type="button"
                    className="action-danger"
                    disabled={busyId === c.id}
                    onClick={() => remove(c.id)}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
