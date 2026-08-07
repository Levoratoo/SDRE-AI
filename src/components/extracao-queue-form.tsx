"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const SPEED = {
  turbo: {
    label: "Turbo",
    delayMinMs: 500,
    delayMaxMs: 1100,
    hint: "~2–3x mais rápido; risco de rate-limit",
  },
  rapido: {
    label: "Rápido",
    delayMinMs: 700,
    delayMaxMs: 1600,
    hint: "padrão recomendado",
  },
  seguro: {
    label: "Seguro",
    delayMinMs: 2000,
    delayMaxMs: 4500,
    hint: "mais lento, menos bloqueio",
  },
} as const;

type SpeedKey = keyof typeof SPEED;

export function ExtracaoQueueForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [nome, setNome] = useState("");
  const [limite, setLimite] = useState("");
  const [speed, setSpeed] = useState<SpeedKey>("rapido");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setErr(null);
    try {
      const preset = SPEED[speed];
      const r = await fetch("/api/extracoes/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          nome: nome || undefined,
          limite: limite ? Number(limite) : null,
          delayMinMs: preset.delayMinMs,
          delayMaxMs: preset.delayMaxMs,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao enfileirar");
      setMsg(
        j.aviso ||
          `Fila criada para @${j.extraction.perfil_alvo_username}.`,
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
      <h2>Nova extração</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Cole o @ do Instagram. O worker na VPS processa a fila 24/7 (PC pode
        ficar desligado). Sincronize a sessão na extensão uma vez.
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
        <div className="field">
          <label>Velocidade</label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(SPEED) as SpeedKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={speed === key ? "btn primary small" : "btn outline small"}
                onClick={() => setSpeed(key)}
              >
                {SPEED[key].label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            {SPEED[speed].hint}
          </p>
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
