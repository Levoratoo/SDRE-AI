"use client";

import { FormEvent, useEffect, useState } from "react";

type Msg = {
  id: string;
  titulo: string;
  texto: string;
  tipo: string;
};

export function MensagensClient() {
  const [items, setItems] = useState<Msg[]>([]);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("Oi {primeiro_nome}, tudo bem?");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/mensagens?tipo=dm");
    const j = await r.json();
    if (j.ok) setItems(j.mensagens);
  }

  useEffect(() => {
    load().catch(() => setErr("Falha ao carregar"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, texto, tipo: "dm" }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setTitulo("");
      setTexto("Oi {primeiro_nome}, tudo bem?");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir mensagem?")) return;
    await fetch(`/api/mensagens?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="card">
        <h2>Nova mensagem (DM)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Placeholders: {"{primeiro_nome}"}, {"{nome}"}, {"{username}"}
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="titulo">Título</label>
            <input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ex: cumprimento"
              required
              maxLength={120}
            />
          </div>
          <div className="field">
            <label htmlFor="texto">Texto</label>
            <textarea
              id="texto"
              rows={4}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              required
            />
          </div>
          {err ? <p className="err">{err}</p> : null}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Minhas mensagens</h2>
        {items.length === 0 ? (
          <p className="muted">Nenhuma mensagem ainda.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((m) => (
              <div
                key={m.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{m.titulo}</strong>
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => remove(m.id)}
                  >
                    Excluir
                  </button>
                </div>
                <p className="muted" style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                  {m.texto}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
