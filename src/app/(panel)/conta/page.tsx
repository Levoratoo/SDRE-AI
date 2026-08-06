import { requireSession } from "@/lib/session";

export default async function ContaPage() {
  const session = await requireSession();

  return (
    <>
      <h1 className="page-title">Minha Conta</h1>
      <p className="page-sub">Dados da conta</p>
      <div className="card">
        <div className="field">
          <label>Nome</label>
          <input value={session.user.name} readOnly />
        </div>
        <div className="field">
          <label>E-mail</label>
          <input value={session.user.email} readOnly />
        </div>
        <p className="muted">Troca de senha chega na próxima iteração.</p>
      </div>
    </>
  );
}
