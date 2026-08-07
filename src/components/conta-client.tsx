"use client";

import { FormEvent, useState } from "react";

export function ContaClient({
  email,
  initialName,
}: {
  email: string;
  initialName: string;
}) {
  const [nome, setNome] = useState(initialName);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConf, setSenhaConf] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function saveNome(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/conta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setMsg("Nome salvo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function saveSenha(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      if (senhaNova !== senhaConf) throw new Error("Confirmação não confere");
      const r = await fetch("/api/conta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, senhaNova }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      setSenhaAtual("");
      setSenhaNova("");
      setSenhaConf("");
      setMsg("Senha alterada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {err ? <div className="alert danger">{err}</div> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <div className="card">
        <h2>Dados da conta</h2>
        <form onSubmit={saveNome}>
          <div className="field">
            <label>E-mail</label>
            <input value={email} readOnly />
            <span className="muted" style={{ fontSize: 13 }}>
              O e-mail não pode ser alterado.
            </span>
          </div>
          <div className="field">
            <label>Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            Salvar nome
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Trocar senha</h2>
        <form onSubmit={saveSenha}>
          <div className="field">
            <label>Senha atual</label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Nova senha</label>
            <input
              type="password"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="field">
            <label>Confirmar nova senha</label>
            <input
              type="password"
              value={senhaConf}
              onChange={(e) => setSenhaConf(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            Atualizar senha
          </button>
        </form>
      </div>
    </>
  );
}
