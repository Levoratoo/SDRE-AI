export default function ComentariosPage() {
  return (
    <>
      <h1 className="page-title orange-text">Comentários</h1>
      <p className="page-sub">
        Templates de comentário automático nos posts dos leads.
      </p>
      <div className="card">
        <h2>Novo comentário</h2>
        <div className="field">
          <label>Título (uso interno)</label>
          <input placeholder="ex: engajamento post" disabled />
        </div>
        <div className="field">
          <label>Comentário</label>
          <textarea rows={4} placeholder="Parabéns! 🔥" disabled />
        </div>
        <p className="muted">Em breve — disparo de comentários na campanha.</p>
        <button className="btn primary" type="button" disabled>
          Salvar
        </button>
      </div>
      <div className="card">
        <h2>Meus comentários</h2>
        <p className="muted" style={{ margin: 0 }}>
          Nenhum comentário ainda.
        </p>
      </div>
    </>
  );
}
