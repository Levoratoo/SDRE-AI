export default function StoriesPage() {
  return (
    <>
      <h1 className="page-title orange-text">Stories</h1>
      <p className="page-sub">
        Respostas e curtidas em stories dos leads durante a campanha.
      </p>
      <div className="card">
        <h2>Novo template de storie</h2>
        <div className="field">
          <label>Título</label>
          <input placeholder="ex: reply storie" disabled />
        </div>
        <div className="field">
          <label>Texto</label>
          <textarea rows={4} placeholder="Mandou bem no storie!" disabled />
        </div>
        <p className="muted">Em breve — integração com o disparador.</p>
        <button className="btn primary" type="button" disabled>
          Salvar
        </button>
      </div>
    </>
  );
}
