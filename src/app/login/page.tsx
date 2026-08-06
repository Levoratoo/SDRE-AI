"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message || "Falha ao entrar");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark">LP</span>
          <div>
            <div className="brand-name">Levorato Prospect</div>
            <div className="brand-sub">Bem-vindo de volta</div>
          </div>
        </div>

        <h1>Entrar</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
          Prospecção via Instagram
        </p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? <p className="err">{error}</p> : null}

          <div className="auth-actions">
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
