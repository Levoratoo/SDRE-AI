import { ExtensaoClient } from "@/components/extensao-client";

export default function ExtensaoPage() {
  return (
    <>
      <h1 className="page-title orange-text">Extensão</h1>
      <p className="page-sub">
        Opcional. O fluxo completo (sessão + extração + campanha) já roda pelo
        painel e pela VPS — use a extensão só se quiser o atalho no navegador.
      </p>
      <ExtensaoClient />
    </>
  );
}
