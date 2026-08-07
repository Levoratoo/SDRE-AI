"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Sessao = {
  igUsername: string | null;
  igUserPk: string | null;
  syncedAt: string | null;
  sessionidMasked: string;
  temCsrf: boolean;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function IgSessionClient() {
  const [conectado, setConectado] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [cookies, setCookies] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/sessao/ig", { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) return;
    setConectado(!!j.conectado);
    setSessao(j.sessao);
    if (j.sessao?.igUsername) setUsername(j.sessao.igUsername);
  }, []);

  useEffect(() => {
    load().catch(() => setErr("Falha ao carregar sessão IG"));
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/sessao/ig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookies,
          username: username || undefined,
          userAgent: navigator.userAgent,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao sincronizar");
      setCookies("");
      setMsg(
        "Sessão salva. Extrações e campanhas na VPS já podem usar esta conta.",
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function onClear() {
    if (!confirm("Remover sessão do Instagram deste painel?")) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/sessao/ig", { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setMsg("Sessão removida.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <h2 style={{ margin: 0 }}>Sessão Instagram (sem extensão)</h2>
        {conectado ? (
          <span className="pill status-finished">Conectado</span>
        ) : (
          <span className="pill status-paused">Não conectado</span>
        )}
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        Cole o cookie <strong>sessionid</strong> (e, se tiver, csrftoken /
        ds_user_id). Assim a VPS trabalha 24/7 sem instalar extensão.
      </p>

      {conectado && sessao ? (
        <div
          className="muted"
          style={{
            marginBottom: 14,
            fontSize: 13,
            display: "grid",
            gap: 4,
          }}
        >
          <div>
            Conta:{" "}
            <span className="mono" style={{ color: "#fff" }}>
              {sessao.igUsername ? `@${sessao.igUsername}` : "—"}
            </span>
          </div>
          <div>
            sessionid: <span className="mono">{sessao.sessionidMasked}</span>
          </div>
          <div>Última sync: {fmtDate(sessao.syncedAt)}</div>
        </div>
      ) : null}

      {err ? <div className="alert danger">{err}</div> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <form onSubmit={onSave}>
        <div className="field">
          <label htmlFor="ig-user">@ do Instagram (opcional)</label>
          <input
            id="ig-user"
            placeholder="@sua_conta"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ig-cookies">Cookies / sessionid</label>
          <textarea
            id="ig-cookies"
            rows={5}
            placeholder={
              "sessionid=...\ncsrftoken=...\nds_user_id=...\n\nou só o valor do sessionid"
            }
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            required
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
          />
        </div>
        <details style={{ marginBottom: 14 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            Como pegar o sessionid no navegador
          </summary>
          <ol className="muted" style={{ fontSize: 13, paddingLeft: 18 }}>
            <li>Abra instagram.com logado</li>
            <li>F12 → Application (ou Armazenamento) → Cookies → https://www.instagram.com</li>
            <li>
              Copie o valor de <strong>sessionid</strong> (e idealmente
              csrftoken + ds_user_id)
            </li>
            <li>Cole aqui e salve</li>
          </ol>
        </details>
        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? "Salvando…" : "Salvar sessão"}
          </button>
          {conectado ? (
            <button
              type="button"
              className="btn ghost"
              disabled={loading}
              onClick={() => void onClear()}
            >
              Remover
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
