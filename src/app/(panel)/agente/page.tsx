export default function AgentePage() {
  return (
    <>
      <h1 className="page-title orange-text">Agente IA</h1>
      <p className="page-sub">
        Atendimento automático via webhook Meta / Instagram.
      </p>

      <div className="card">
        <h2>1. Credenciais Meta</h2>
        <div className="field">
          <label>Page Access Token</label>
          <input placeholder="EAAG..." disabled />
        </div>
        <div className="field">
          <label>Verify Token</label>
          <input placeholder="token de verificação" disabled />
        </div>
        <p className="muted">Em breve — Fase 5.</p>
      </div>

      <div className="card">
        <h2>2. Prompt do agente</h2>
        <div className="field">
          <label>Instruções</label>
          <textarea
            rows={8}
            disabled
            defaultValue="Você é um assistente de prospecção no Instagram..."
          />
        </div>
        <div className="char-count">Em breve</div>
        <button className="btn primary" type="button" disabled>
          Salvar
        </button>
      </div>
    </>
  );
}
