"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Algo deu errado</h1>
        <p className="muted">{error.message || "Erro inesperado"}</p>
        <button className="btn primary" type="button" onClick={reset}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
