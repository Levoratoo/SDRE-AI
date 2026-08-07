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
        <h2>Nova mensagem</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="titulo">Título (uso interno)</label>
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
            <label htmlFor="texto">Mensagem</label>
            <textarea
              id="texto"
              rows={5}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              required
              maxLength={900}
            />
          </div>
          <div className="char-count">{texto.length} / 900</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Placeholders: {"{primeiro_nome}"}, {"{nome}"}, {"{username}"}
          </p>
          {err ? <p className="err">{err}</p> : null}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Minhas mensagens</h2>
        {items.length === 0 ? (
          <p className="muted">Nenhuma mensagem ainda.</p>
        ) : (
          <div className="msg-list">
            {items.map((m, i) => (
              <div key={m.id} className="msg-item">
                <div className="msg-item-head">
                  <div>
                    <div className="msg-title">
                      {i + 1}. {m.titulo}
                    </div>
                    <p className="msg-body">{m.texto}</p>
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <button
                      type="button"
                      className="action-danger"
                      onClick={() => remove(m.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
