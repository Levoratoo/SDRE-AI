"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Sessao = {
  igUsername: string | null;
  igUserPk: string | null;
  syncedAt: string | null;
  sessionidMasked: string;
  temCsrf: boolean;
};

type SyncDoneDetail = {
  ok?: boolean;
  erro?: string;
  info?: { ig_username?: string };
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function pingExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const onPong = () => {
      if (done) return;
      done = true;
      document.removeEventListener("levorato-pong", onPong);
      resolve(true);
    };
    document.addEventListener("levorato-pong", onPong);
    document.dispatchEvent(new CustomEvent("levorato-ping"));
    setTimeout(() => {
      if (!done) {
        done = true;
        document.removeEventListener("levorato-pong", onPong);
        resolve(false);
      }
    }, 900);
  });
}

function syncViaExtension(): Promise<SyncDoneDetail> {
  return new Promise((resolve) => {
    const onDone = (e: Event) => {
      document.removeEventListener("levorato-sync-ig-done", onDone);
      resolve((e as CustomEvent<SyncDoneDetail>).detail || {});
    };
    document.addEventListener("levorato-sync-ig-done", onDone);
    document.dispatchEvent(new CustomEvent("levorato-sync-ig"));
    setTimeout(() => {
      document.removeEventListener("levorato-sync-ig-done", onDone);
      resolve({ ok: false, erro: "Extensão não respondeu. Recarregue a página." });
    }, 45000);
  });
}

export function IgSessionClient() {
  const [conectado, setConectado] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [cookies, setCookies] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncingExt, setSyncingExt] = useState(false);
  const [extPresent, setExtPresent] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingExtension();
      if (!cancelled) setExtPresent(ok);
    };
    void check();
    const t = setInterval(() => void check(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function onSyncExtension() {
    setSyncingExt(true);
    setErr(null);
    setMsg(null);
    try {
      if (!extPresent) {
        const detected = await pingExtension();
        setExtPresent(detected);
        if (!detected) {
          throw new Error(
            "Extensão não detectada. Instale em Extensão e recarregue esta página.",
          );
        }
      }
      const r = await syncViaExtension();
      if (!r.ok) throw new Error(r.erro || "Falha ao sincronizar");
      const ig = r.info?.ig_username;
      setMsg(
        ig
          ? `Sessão sincronizada (@${ig}). A VPS já pode usar esta conta.`
          : "Sessão sincronizada. A VPS já pode usar esta conta.",
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncingExt(false);
    }
  }

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
      if (!j.ok) throw new Error(j.erro || "Falha ao salvar");
      setCookies("");
      setMsg("Sessão salva manualmente.");
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
        <h2 style={{ margin: 0 }}>Sessão Instagram</h2>
        {conectado ? (
          <span className="pill status-finished">Conectado</span>
        ) : (
          <span className="pill status-paused">Não conectado</span>
        )}
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        Com a extensão instalada, basta estar logado no Instagram no navegador e
        clicar em <strong>Sincronizar com extensão</strong>. A sessão vai direto
        para a VPS — sem copiar cookies.
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

      <div className="ig-sync-primary">
        <button
          type="button"
          className="btn primary"
          disabled={syncingExt}
          onClick={() => void onSyncExtension()}
        >
          {syncingExt ? "Sincronizando…" : "Sincronizar com extensão"}
        </button>
        {extPresent ? (
          <span className="muted" style={{ fontSize: 13 }}>
            Extensão detectada nesta página.
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            Extensão não detectada —{" "}
            <Link className="link-accent" href="/extensao">
              instalar e configurar
            </Link>
          </span>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
        Requisitos: Instagram aberto e logado no Chrome + extensão Levorato
        Prospect na mesma conta do painel.
      </p>

      <details className="ig-sync-manual" style={{ marginTop: 18 }}>
        <summary className="muted" style={{ cursor: "pointer" }}>
          Colar cookies manualmente (alternativa)
        </summary>
        <form onSubmit={onSave} style={{ marginTop: 12 }}>
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
              rows={4}
              placeholder={
                "sessionid=...\ncsrftoken=...\nds_user_id=...\n\nou só o valor do sessionid"
              }
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              required
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
            />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button type="submit" className="btn secondary" disabled={loading}>
              {loading ? "Salvando…" : "Salvar manualmente"}
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
      </details>
    </div>
  );
}
