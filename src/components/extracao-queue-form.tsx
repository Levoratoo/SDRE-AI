"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ExtracaoQueueForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [nome, setNome] = useState("");
  const [limite, setLimite] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch("/api/extracoes/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          nome: nome || undefined,
          limite: limite ? Number(limite) : null,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao enfileirar");
      setMsg(
        j.aviso ||
          `Fila criada para @${j.extraction.perfil_alvo_username}. A extensão inicia sozinha.`,
      );
      setUsername("");
      setNome("");
      setLimite("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Extrair seguidores</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Cole o @ do Instagram. Com a extensão instalada, sessão sincronizada e
        Opera aberto, a captura começa automaticamente.
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="username">Perfil-alvo</label>
          <input
            id="username"
            placeholder="@concorrente ou instagram.com/concorrente"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="nome">Nome da extração (opcional)</label>
          <input
            id="nome"
            placeholder="ex: seguidores concorrente X"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="limite">Limite de leads (opcional)</label>
          <input
            id="limite"
            type="number"
            min={1}
            placeholder="vazio = todos"
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
          />
        </div>
        {msg ? <p className="ok">{msg}</p> : null}
        {err ? <p className="err">{err}</p> : null}
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Enfileirando…" : "Extrair agora"}
        </button>
      </form>
    </div>
  );
}
