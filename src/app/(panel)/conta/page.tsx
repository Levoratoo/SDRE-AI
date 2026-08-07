import { ContaClient } from "@/components/conta-client";
import { requireSession } from "@/lib/session";

export default async function ContaPage() {
  const session = await requireSession();

  return (
    <>
      <h1 className="page-title gradient-text">Minha Conta</h1>
      <p className="page-sub">Gerencie seus dados de acesso.</p>
      <ContaClient email={session.user.email} initialName={session.user.name} />
    </>
  );
}
