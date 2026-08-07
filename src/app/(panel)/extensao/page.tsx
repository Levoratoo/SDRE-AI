import { ExtensaoClient } from "@/components/extensao-client";

export default function ExtensaoPage() {
  return (
    <>
      <h1 className="page-title orange-text">Extensão</h1>
      <p className="page-sub">
        Baixe a extensão, instale no Chrome e sincronize a sessão do Instagram em
        Minha Conta — um clique, sem copiar cookies.
      </p>
      <ExtensaoClient />
    </>
  );
}
