import { ContaClient } from "@/components/conta-client";
import { IgSessionClient } from "@/components/ig-session-client";
import { requireSession } from "@/lib/session";

export default async function ContaPage() {
  const session = await requireSession();

  return (
    <>
      <h1 className="page-title gradient-text">Minha Conta</h1>
      <p className="page-sub">
        Dados de acesso e sessão do Instagram para a VPS (extensão ou colagem
        manual).
      </p>
      <IgSessionClient />
      <ContaClient email={session.user.email} initialName={session.user.name} />
    </>
  );
}
