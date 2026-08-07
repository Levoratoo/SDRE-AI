"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Sessao = {
  igUsername: string | null;
  igProfilePicUrl: string | null;
  syncedAt: string | null;
};

type SyncDoneDetail = {
  ok?: boolean;
  erro?: string;
  info?: { ig_username?: string };
};

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
  const [syncing, setSyncing] = useState(false);
  const [extPresent, setExtPresent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/sessao/ig", { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) return;
    setConectado(!!j.conectado);
    setSessao(j.sessao);
  }, []);

  useEffect(() => {
    load().catch(() => setErr("Não foi possível carregar a conta do Instagram."));
  }, [load]);

  useEffect(() => {
    const onUpdated = () => void load();
    document.addEventListener("levorato-ig-session-updated", onUpdated);
    return () =>
      document.removeEventListener("levorato-ig-session-updated", onUpdated);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingExtension();
      if (!cancelled) setExtPresent(ok);
    };
    void check();
    const t = setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function onSync() {
    setSyncing(true);
    setErr(null);
    try {
      if (!extPresent) {
        const detected = await pingExtension();
        setExtPresent(detected);
        if (!detected) {
          throw new Error(
            "Instale a extensão primeiro (menu Extensão) e recarregue esta página.",
          );
        }
      }
      const r = await syncViaExtension();
      if (!r.ok) throw new Error(r.erro || "Não foi possível sincronizar");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  async function onDisconnect() {
    if (!confirm("Desconectar esta conta do Instagram?")) return;
    setSyncing(true);
    setErr(null);
    try {
      const r = await fetch("/api/sessao/ig", { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  const handle = sessao?.igUsername
    ? `@${sessao.igUsername.replace(/^@/, "")}`
    : null;

  return (
    <div className="card ig-account-card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <h2 style={{ margin: 0 }}>Instagram na jornada</h2>
        {conectado ? (
          <span className="pill status-finished">Conectado</span>
        ) : (
          <span className="pill status-paused">Não conectado</span>
        )}
      </div>

      <div className="ig-account-hero">
        {conectado ? (
          <div className="ig-account-visual">
            {sessao?.igProfilePicUrl ? (
              <img
                className="ig-account-avatar"
                src={sessao.igProfilePicUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="ig-account-avatar ig-account-avatar-placeholder" aria-hidden>
                IG
              </div>
            )}
            <div>
              {handle ? (
                <div className="ig-account-handle">{handle}</div>
              ) : (
                <div className="ig-account-handle muted-handle">Conta conectada</div>
              )}
              <p className="muted ig-account-hint" style={{ marginTop: 6 }}>
                Esta é a conta que a VPS usa para extrair e disparar.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="ig-account-empty">
              Nenhuma conta do Instagram vinculada ainda.
            </div>
            <p className="muted ig-account-hint">
              Conecte a conta que está logada no Chrome para começar.
            </p>
          </>
        )}
      </div>

      {err ? <div className="alert danger">{err}</div> : null}

      <div className="ig-account-actions">
        <button
          type="button"
          className="btn primary"
          disabled={syncing}
          onClick={() => void onSync()}
        >
          {syncing
            ? "Sincronizando…"
            : conectado
              ? "Trocar / atualizar conta"
              : "Conectar conta do navegador"}
        </button>
        {conectado ? (
          <button
            type="button"
            className="btn ghost"
            disabled={syncing}
            onClick={() => void onDisconnect()}
          >
            Desconectar
          </button>
        ) : null}
      </div>

      {!extPresent ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          Precisa da extensão no Chrome —{" "}
          <Link className="link-accent" href="/extensao">
            baixar e instalar
          </Link>
          . Depois, abra instagram.com logado e clique no botão acima.
        </p>
      ) : null}
    </div>
  );
}
