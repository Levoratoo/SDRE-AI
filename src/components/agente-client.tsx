"use client";

import { useCallback, useEffect, useState } from "react";

type Agente = {
  ativo: boolean;
  prompt: string;
  responder_todos: boolean;
  responder_prospectados: boolean;
  callback_url: string;
  verify_token: string;
  meta_ig_business_id: string;
  has_meta_access_token: boolean;
  meta_access_token_mask: string | null;
  total_mensagens: number;
  ultima_msg_em: string | null;
  model: string;
};

async function api(action: string, body?: Record<string, unknown>) {
  const opts: RequestInit = {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  const r = await fetch(`/api/agente?action=${action}`, opts);
  return r.json();
}

function fmtDate(s: string | null) {
  if (!s) return "nunca";
  return new Date(s).toLocaleString("pt-BR");
}

export function AgenteClient() {
  const [agente, setAgente] = useState<Agente | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [respTodos, setRespTodos] = useState(false);
  const [respProsp, setRespProsp] = useState(true);
  const [igId, setIgId] = useState("");
  const [metaToken, setMetaToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await api("get");
    if (!j.ok) throw new Error(j.erro || "Falha ao carregar");
    const a = j.agente as Agente;
    setAgente(a);
    setAtivo(a.ativo);
    setPrompt(a.prompt || "");
    setRespTodos(a.responder_todos);
    setRespProsp(a.responder_prospectados);
    setIgId(a.meta_ig_business_id || "");
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [load]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function onSave() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        ativo,
        prompt,
        responder_todos: respTodos,
        responder_prospectados: respProsp,
        meta_ig_business_id: igId.trim(),
      };
      if (metaToken.trim()) payload.meta_access_token = metaToken.trim();

      const j = await api("update", payload);
      if (!j.ok) throw new Error(j.erro || "Erro ao salvar");
      setMetaToken("");
      setShowToken(false);
      setMsg("Salvo.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function onRegenerate() {
    if (
      !confirm(
        "Gerar novos tokens de webhook?\n\nOs valores atuais deixam de funcionar. Reconfigure no Facebook Developer.",
      )
    ) {
      return;
    }
    setErr(null);
    setMsg(null);
    const j = await api("regenerate_tokens", {});
    if (!j.ok) {
      setErr(j.erro || "Falha ao regenerar");
      return;
    }
    setMsg("Novos tokens gerados. Atualize no Facebook Developer.");
    await load();
  }

  if (loading) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Carregando configuração…
        </p>
      </div>
    );
  }

  if (!agente) {
    return (
      <div className="card">
        <p className="err-banner">{err || "Não foi possível carregar o agente."}</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="panel-head-row">
          <h2>Status do agente</h2>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span>{ativo ? "Ativo" : "Inativo"}</span>
          </label>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Quando ativo, as mensagens do Direct são processadas automaticamente
          pela IA ({agente.model}). A chave OpenAI fica só no servidor.
        </p>
      </div>

      <div className="card">
        <h2>1. Configuração do Webhook (Facebook Developer)</h2>
        <p className="muted">
          Cole os valores abaixo no app do Facebook, seção Webhooks → Instagram →
          Editar.
        </p>
        <div className="field">
          <label>Callback URL</label>
          <div className="copy-row">
            <input readOnly value={agente.callback_url} />
            <button
              type="button"
              className="btn secondary small"
              onClick={async () => {
                const ok = await copy(agente.callback_url);
                setMsg(ok ? "URL copiada." : "Não foi possível copiar.");
              }}
            >
              Copiar
            </button>
          </div>
        </div>
        <div className="field">
          <label>Verify Token</label>
          <div className="copy-row">
            <input readOnly value={agente.verify_token} />
            <button
              type="button"
              className="btn secondary small"
              onClick={async () => {
                const ok = await copy(agente.verify_token);
                setMsg(ok ? "Token copiado." : "Não foi possível copiar.");
              }}
            >
              Copiar
            </button>
          </div>
        </div>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => void onRegenerate()}
        >
          Gerar novos tokens
        </button>
      </div>

      <div className="card">
        <h2>2. Credenciais para responder no Direct</h2>
        <p className="muted">
          Access Token da API do Instagram + ID da conta Business. Cada usuário
          configura a própria conta.
        </p>
        <div className="field">
          <label>Instagram Business Account ID</label>
          <input
            value={igId}
            onChange={(e) => setIgId(e.target.value)}
            placeholder="17841400000000000"
          />
        </div>
        <div className="field">
          <label>Meta Access Token</label>
          <div className="copy-row">
            <input
              type={showToken ? "text" : "password"}
              value={metaToken}
              onChange={(e) => setMetaToken(e.target.value)}
              placeholder={
                agente.has_meta_access_token
                  ? `Salvo (${agente.meta_access_token_mask || "••••"}) — digite para substituir`
                  : "EAAxxxxxxxx..."
              }
              autoComplete="off"
            />
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {agente.has_meta_access_token
              ? "Token Meta salvo. Deixe em branco para manter."
              : "Nenhum token Meta salvo ainda."}
          </p>
        </div>
      </div>

      <div className="card">
        <h2>3. Prompt do agente</h2>
        <p className="muted">
          Instruções que a IA vai seguir. Escreva como se falasse com um
          assistente humano.
        </p>
        <div className="field">
          <textarea
            rows={10}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Você é um assistente de vendas simpático e objetivo..."
          />
          <div className="char-count">{prompt.length} caracteres</div>
        </div>
      </div>

      <div className="card">
        <h2>4. Comportamento</h2>
        <label className="switch-block">
          <input
            type="checkbox"
            checked={respTodos}
            onChange={(e) => setRespTodos(e.target.checked)}
          />
          <span>
            <strong>Responder todas as mensagens</strong>
            <span className="muted">
              Responde qualquer DM, inclusive fora da base de leads.
            </span>
          </span>
        </label>
        <label className="switch-block">
          <input
            type="checkbox"
            checked={respProsp}
            onChange={(e) => setRespProsp(e.target.checked)}
          />
          <span>
            <strong>Responder apenas leads prospectados</strong>
            <span className="muted">
              Só responde quem já recebeu disparo de campanha sua.
            </span>
          </span>
        </label>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
          {msg ? <span className="muted">{msg}</span> : null}
          {err ? <span className="err-inline">{err}</span> : null}
        </div>
      </div>

      <div className="card">
        <h2>Estatísticas</h2>
        <div className="stats" style={{ marginBottom: 0 }}>
          <div className="stat">
            <div className="stat-label">Mensagens processadas</div>
            <div className="stat-value">
              {agente.total_mensagens.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Última mensagem em</div>
            <div className="stat-value" style={{ fontSize: "1.05rem" }}>
              {fmtDate(agente.ultima_msg_em)}
            </div>
          </div>
        </div>
      </div>

      <div className="card ag-help">
        <h2>Como pegar as credenciais do Meta</h2>
        <h3>A. Instagram Business Account ID</h3>
        <ol>
          <li>
            Acesse o{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
            >
              Graph API Explorer
            </a>
          </li>
          <li>Selecione seu app</li>
          <li>
            GET: <code>me/accounts?fields=instagram_business_account,name</code>
          </li>
          <li>
            Copie <code>instagram_business_account.id</code>
          </li>
        </ol>
        <h3>B. Access Token</h3>
        <ol>
          <li>No Graph API Explorer, gere um User/Page token</li>
          <li>
            Permissões: <code>instagram_basic</code>,{" "}
            <code>instagram_manage_messages</code>, <code>pages_show_list</code>,{" "}
            <code>pages_manage_metadata</code>, <code>pages_messaging</code>,{" "}
            <code>business_management</code>
          </li>
          <li>Troque por token de longa duração (60 dias) e salve aqui</li>
        </ol>
      </div>
    </>
  );
}
