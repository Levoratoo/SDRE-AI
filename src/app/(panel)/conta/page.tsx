import { requireSession } from "@/lib/session";

export default async function ContaPage() {
  const session = await requireSession();

  return (
    <>
      <h1 className="page-title gradient-text">Minha Conta</h1>
      <p className="page-sub">Gerencie seus dados de acesso.</p>

      <div className="card">
        <h2>Dados da conta</h2>
        <div className="field">
          <label>E-mail</label>
          <input value={session.user.email} readOnly />
          <span className="muted" style={{ fontSize: 13 }}>
            O e-mail não pode ser alterado.
          </span>
        </div>
        <div className="field">
          <label>Nome</label>
          <input value={session.user.name} readOnly />
        </div>
        <button className="btn primary" type="button" disabled>
          Salvar nome
        </button>
      </div>

      <div className="card">
        <h2>Trocar senha</h2>
        <div className="field">
          <label>Senha atual</label>
          <input type="password" placeholder="••••••••" disabled />
        </div>
        <div className="field">
          <label>Nova senha</label>
          <input type="password" placeholder="Mínimo 8 caracteres" disabled />
        </div>
        <div className="field">
          <label>Confirmar nova senha</label>
          <input type="password" placeholder="Repita a nova senha" disabled />
        </div>
        <p className="muted">Troca de senha chega na próxima iteração.</p>
      </div>
    </>
  );
}
