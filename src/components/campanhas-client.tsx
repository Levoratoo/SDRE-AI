"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Msg = { id: string; titulo: string; texto: string; tipo: string };
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
  comentar: boolean;
  curtir: boolean;
  storie: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  messageIds: string[] | null;
};

const STATUS: Record<string, string> = {
  draft: "Rascunho",
  running: "Rodando",
  paused: "Pausada",
  finished: "Concluída",
  cancelled: "Cancelada",
};

const DAYS = [
  { v: 1, l: "Seg" },
  { v: 2, l: "Ter" },
  { v: 3, l: "Qua" },
  { v: 4, l: "Qui" },
  { v: 5, l: "Sex" },
  { v: 6, l: "Sáb" },
  { v: 0, l: "Dom" },
];

export function CampanhasClient({ leadsCount }: { leadsCount: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [comments, setComments] = useState<Msg[]>([]);
  const [stories, setStories] = useState<Msg[]>([]);
  const [items, setItems] = useState<Campanha[]>([]);
  const [nome, setNome] = useState("");
  const [messageIds, setMessageIds] = useState<string[]>([]);
  const [commentIds, setCommentIds] = useState<string[]>([]);
  const [storieIds, setStorieIds] = useState<string[]>([]);
  const [limiteLeads, setLimiteLeads] = useState("100");
  const [minDelay, setMinDelay] = useState("3");
  const [maxDelay, setMaxDelay] = useState("8");
  const [seguir, setSeguir] = useState(true);
  const [comentar, setComentar] = useState(false);
  const [curtir, setCurtir] = useState(false);
  const [storie, setStorie] = useState(false);
  const [somenteNovos, setSomenteNovos] = useState(true);
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("18:00");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [m, c, s, camps] = await Promise.all([
      fetch("/api/mensagens?tipo=dm").then((r) => r.json()),
      fetch("/api/mensagens?tipo=comment").then((r) => r.json()),
      fetch("/api/mensagens?tipo=storie").then((r) => r.json()),
      fetch("/api/campanhas").then((r) => r.json()),
    ]);
    if (m.ok) {
      setMsgs(m.mensagens);
      setMessageIds((prev) =>
        prev.length ? prev : m.mensagens[0] ? [m.mensagens[0].id] : [],
      );
    }
    if (c.ok) setComments(c.mensagens);
    if (s.ok) setStories(s.mensagens);
    if (camps.ok) setItems(camps.campanhas);
  }, []);

  const hasRunning = items.some((c) => c.status === "running");

  useEffect(() => {
    load().catch(() => setErr("Falha ao carregar"));
  }, [load]);

  useEffect(() => {
    const ms = hasRunning ? 4000 : 12000;
    const t = setInterval(() => {
      load().catch(() => {});
    }, ms);
    return () => clearInterval(t);
  }, [load, hasRunning]);

  function toggleId(
    id: string,
    list: string[],
    setList: (v: string[]) => void,
  ) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

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
          messageIds,
          commentIds: comentar ? commentIds : [],
          storieIds: storie ? storieIds : [],
          allLeads: true,
          somenteNovos,
          limiteLeads: Number(limiteLeads) || 100,
          minDelayMin: Number(minDelay) || 3,
          maxDelayMin: Number(maxDelay) || 8,
          seguir,
          comentar,
          curtir,
          storie,
          scheduleStart,
          scheduleEnd,
          scheduleTz: "America/Sao_Paulo",
          scheduleDays,
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
            Crie a fila e aperte Play aqui no painel. Acompanhe enviados/erros
            ao vivo — a VPS dispara 24/7 (sem ficar na extensão).
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
              Crie uma mensagem em{" "}
              <a className="action-pink" href="/mensagens">
                Mensagens
              </a>{" "}
              antes.
            </p>
          ) : (
            <form onSubmit={onCreate}>
              <div className="field">
                <label htmlFor="nome">Nome da campanha</label>
                <input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Mensagens DM (rotação aleatória)</label>
                <div className="check-grid">
                  {msgs.map((m) => (
                    <label key={m.id} className="check-item">
                      <input
                        type="checkbox"
                        checked={messageIds.includes(m.id)}
                        onChange={() =>
                          toggleId(m.id, messageIds, setMessageIds)
                        }
                      />
                      <span>{m.titulo}</span>
                    </label>
                  ))}
                </div>
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

              <label className="switch-block">
                <input
                  type="checkbox"
                  checked={somenteNovos}
                  onChange={(e) => setSomenteNovos(e.target.checked)}
                />
                <span>
                  <strong>Só leads novos</strong>
                  <span className="muted">
                    Ignora quem já recebeu DM em campanha anterior.
                  </span>
                </span>
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div className="field">
                  <label>Delay mín (min)</label>
                  <input
                    type="number"
                    min={1}
                    value={minDelay}
                    onChange={(e) => setMinDelay(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Delay máx (min)</label>
                  <input
                    type="number"
                    min={1}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Horário início</label>
                  <input
                    type="time"
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Horário fim</label>
                  <input
                    type="time"
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>Dias permitidos</label>
                <div className="check-grid">
                  {DAYS.map((d) => (
                    <label key={d.v} className="check-item">
                      <input
                        type="checkbox"
                        checked={scheduleDays.includes(d.v)}
                        onChange={() =>
                          setScheduleDays((prev) =>
                            prev.includes(d.v)
                              ? prev.filter((x) => x !== d.v)
                              : [...prev, d.v],
                          )
                        }
                      />
                      <span>{d.l}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="switch-block">
                <input
                  type="checkbox"
                  checked={seguir}
                  onChange={(e) => setSeguir(e.target.checked)}
                />
                <span>
                  <strong>Seguir perfil</strong>
                  <span className="muted">Após o DM</span>
                </span>
              </label>
              <label className="switch-block">
                <input
                  type="checkbox"
                  checked={curtir}
                  onChange={(e) => setCurtir(e.target.checked)}
                />
                <span>
                  <strong>Curtir último post</strong>
                </span>
              </label>
              <label className="switch-block">
                <input
                  type="checkbox"
                  checked={comentar}
                  onChange={(e) => setComentar(e.target.checked)}
                />
                <span>
                  <strong>Comentar no post</strong>
                </span>
              </label>
              {comentar ? (
                <div className="field">
                  <label>Templates de comentário</label>
                  {comments.length === 0 ? (
                    <p className="muted">
                      Crie em <a href="/comentarios">Comentários</a>.
                    </p>
                  ) : (
                    <div className="check-grid">
                      {comments.map((m) => (
                        <label key={m.id} className="check-item">
                          <input
                            type="checkbox"
                            checked={commentIds.includes(m.id)}
                            onChange={() =>
                              toggleId(m.id, commentIds, setCommentIds)
                            }
                          />
                          <span>{m.titulo}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              <label className="switch-block">
                <input
                  type="checkbox"
                  checked={storie}
                  onChange={(e) => setStorie(e.target.checked)}
                />
                <span>
                  <strong>Responder story</strong>
                </span>
              </label>
              {storie ? (
                <div className="field">
                  <label>Templates de stories</label>
                  {stories.length === 0 ? (
                    <p className="muted">
                      Crie em <a href="/stories">Stories</a>.
                    </p>
                  ) : (
                    <div className="check-grid">
                      {stories.map((m) => (
                        <label key={m.id} className="check-item">
                          <input
                            type="checkbox"
                            checked={storieIds.includes(m.id)}
                            onChange={() =>
                              toggleId(m.id, storieIds, setStorieIds)
                            }
                          />
                          <span>{m.titulo}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <button
                className="btn primary"
                type="submit"
                disabled={loading || !messageIds.length}
              >
                {loading ? "Criando…" : "Salvar campanha"}
              </button>
            </form>
          )}
        </div>
      ) : null}

      <div className="section-head" style={{ marginTop: 8 }}>
        <h2 style={{ margin: 0 }}>Minhas campanhas</h2>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {hasRunning ? (
            <span className="pill status-running" title="Atualizando ao vivo">
              Ao vivo
            </span>
          ) : null}
          <button type="button" className="action-pink" onClick={() => load()}>
            Atualizar
          </button>
        </div>
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
                  {c.curtir ? <span className="pill">Like</span> : null}
                  {c.comentar ? <span className="pill">Comment</span> : null}
                  {c.storie ? <span className="pill">Story</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Delays: {c.minDelayMin}–{c.maxDelayMin} min ·{" "}
                  {(c.messageIds || []).length || 1} DM
                  {c.scheduleStart && c.scheduleEnd
                    ? ` · ${c.scheduleStart}–${c.scheduleEnd}`
                    : ""}
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
