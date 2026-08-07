"use client";

import { useEffect, useState } from "react";

type KeyMeta = {
  hasKey: boolean;
  prefix?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  canReveal?: boolean;
};

export function ExtensaoClient() {
  const [meta, setMeta] = useState<KeyMeta | null>(null);
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const panelUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const crxUrl = `${panelUrl}/levorato-prospect.crx`;
  const zipUrl = `${panelUrl}/levorato-prospect-extension.zip`;

  async function loadMeta() {
    const r = await fetch("/api/extensao/api-key");
    const j = await r.json();
    if (j.ok) setMeta(j.key);
  }

  useEffect(() => {
    loadMeta().catch(() => setError("Falha ao carregar API Key"));
  }, []);

  async function generate(regenerate: boolean) {
    setLoading(true);
    setError(null);
    setCopied(null);
    try {
      const r = await fetch("/api/extensao/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro ao gerar chave");
      setPlainKey(j.apiKey);
      await copy(j.apiKey, "key");
      await loadMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function revealAndCopy() {
    setRevealing(true);
    setError(null);
    try {
      const r = await fetch("/api/extensao/api-key?reveal=1");
      const j = await r.json();
      if (!j.ok) {
        if (j.needsRegenerate) {
          setError(j.erro);
          return;
        }
        throw new Error(j.erro || "Não foi possível revelar a chave");
      }
      setPlainKey(j.apiKey);
      await copy(j.apiKey, "key");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setRevealing(false);
    }
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <div className="card">
        <h2>Preferência: sem extensão</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Para rodar tudo pelo painel + VPS, vá em{" "}
          <a className="link-accent" href="/conta">
            Minha Conta
          </a>{" "}
          e cole o <strong>sessionid</strong> do Instagram. A extensão abaixo é
          só atalho opcional.
        </p>
      </div>

      <div className="card">
        <h2>1. Instale a extensão (Opera)</h2>
        <p className="muted">
          Copie o link e cole na barra do Opera — ele baixa o `.crx`
          automaticamente. Depois ative/confirme a instalação.
        </p>
        <div className="code-box mono">{crxUrl}</div>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            onClick={() => copy(crxUrl, "crx")}
          >
            {copied === "crx" ? "Copiado" : "Copiar link da extensão"}
          </button>
          <a className="btn secondary" href={crxUrl}>
            Baixar .crx
          </a>
          <a className="btn ghost" href={zipUrl}>
            ZIP (modo desenvolvedor)
          </a>
        </div>
      </div>

      <div className="card">
        <h2>2. URL do painel</h2>
        <p className="muted">Cole na configuração da extensão (sem barra no final).</p>
        <div className="code-box mono">{panelUrl}</div>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => copy(panelUrl, "url")}
        >
          {copied === "url" ? "Copiado" : "Copiar URL"}
        </button>
      </div>

      <div className="card">
        <h2>3. Sua API Key</h2>
        <p className="muted">
          A extensão autentica com{" "}
          <span className="mono">Authorization: Bearer pik_…</span>
        </p>

        {meta?.hasKey ? (
          <p>
            Chave ativa: <span className="mono">{meta.prefix}…</span>{" "}
            <span className="pill">ativa</span>
          </p>
        ) : (
          <p className="muted">Nenhuma chave ativa ainda.</p>
        )}

        {plainKey ? (
          <div className="code-box">
            <div className="ok" style={{ marginBottom: 6 }}>
              Chave completa
            </div>
            <div className="mono" style={{ wordBreak: "break-all" }}>
              {plainKey}
            </div>
          </div>
        ) : null}

        {error ? <p className="err">{error}</p> : null}

        <div className="row" style={{ marginTop: 12 }}>
          {!meta?.hasKey ? (
            <button
              type="button"
              className="btn primary"
              disabled={loading}
              onClick={() => generate(false)}
            >
              {loading ? "Gerando…" : "Gerar API Key"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn primary"
                disabled={revealing || loading}
                onClick={() => {
                  if (plainKey) {
                    void copy(plainKey, "key");
                    return;
                  }
                  void revealAndCopy();
                }}
              >
                {copied === "key"
                  ? "Copiado!"
                  : revealing
                    ? "Copiando…"
                    : "Copiar chave completa"}
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={loading}
                onClick={() => {
                  if (
                    !confirm(
                      "Gerar nova chave invalida a atual na extensão. Continuar?",
                    )
                  ) {
                    return;
                  }
                  void generate(true);
                }}
              >
                {loading ? "Gerando…" : "Gerar nova chave"}
              </button>
            </>
          )}
        </div>
        {meta?.hasKey && meta.canReveal === false ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Chave antiga sem cópia salva — clique em <strong>Gerar nova chave</strong>{" "}
            uma vez; depois o botão de copiar funciona sempre.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>4. Ativar e usar (opcional)</h2>
        <ol className="muted" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Abra a extensão → ⚙ → cole URL + API Key → Testar e salvar.</li>
          <li>
            Login no Instagram → <strong>Sincronizar sessão</strong> (ou cole o
            sessionid em Minha Conta).
          </li>
          <li>
            Extrações e campanhas: use o <strong>painel</strong> — a VPS
            processa 24/7.
          </li>
        </ol>
      </div>
    </>
  );
}
