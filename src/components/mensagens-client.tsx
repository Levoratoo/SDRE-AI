"use client";

import { FormEvent, useEffect, useState } from "react";

type Msg = {
  id: string;
  titulo: string;
  texto: string;
  tipo: string;
};

const DEFAULTS: Record<"dm" | "comment" | "storie", string> = {
  dm: "Oi {primeiro_nome}, tudo bem?",
  comment: "Conteúdo incrível, {primeiro_nome}! 🔥",
  storie: "Vi seu storie, {primeiro_nome}!",
};

export function MensagensClient({
  tipo = "dm",
}: {
  tipo?: "dm" | "comment" | "storie";
}) {
  const [items, setItems] = useState<Msg[]>([]);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState(DEFAULTS[tipo]);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/mensagens?tipo=${tipo}`);
    const j = await r.json();
    if (j.ok) setItems(j.mensagens);
  }

  useEffect(() => {
    load().catch(() => setErr("Falha ao carregar"));
  }, [tipo]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/mensagens", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editId
            ? { id: editId, titulo, texto }
            : { titulo, texto, tipo },
        ),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setTitulo("");
      setTexto(DEFAULTS[tipo]);
      setEditId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir?")) return;
    await fetch(`/api/mensagens?id=${id}`, { method: "DELETE" });
    await load();
  }

  function startEdit(m: Msg) {
    setEditId(m.id);
    setTitulo(m.titulo);
    setTexto(m.texto);
  }

  const title =
    tipo === "dm"
      ? "Mensagens DM"
      : tipo === "comment"
        ? "Comentários"
        : "Stories";

  return (
    <>
      <div className="card">
        <h2>{editId ? "Editar" : "Novo"} {title.slice(0, -1).toLowerCase() || "item"}</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="titulo">Título (uso interno)</label>
            <input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ex: abordagem"
              required
              maxLength={120}
            />
          </div>
          <div className="field">
            <label htmlFor="texto">Texto</label>
            <textarea
              id="texto"
              rows={5}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              required
              maxLength={900}
            />
            <div className="char-count">
              Placeholders: {"{nome}"} {"{primeiro_nome}"} {"{username}"} ·{" "}
              {texto.length}/900
            </div>
          </div>
          {err ? <p className="err">{err}</p> : null}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Salvando…" : editId ? "Atualizar" : "Salvar"}
            </button>
            {editId ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setEditId(null);
                  setTitulo("");
                  setTexto(DEFAULTS[tipo]);
                }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Meus templates</h2>
        {items.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nenhum template ainda.
          </p>
        ) : (
          <div className="msg-list">
            {items.map((m) => (
              <div key={m.id} className="msg-item">
                <div>
                  <strong>{m.titulo}</strong>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {m.texto}
                  </p>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button
                    type="button"
                    className="action-pink"
                    onClick={() => startEdit(m)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="action-danger"
                    onClick={() => void remove(m.id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
