import { ExtensaoClient } from "@/components/extensao-client";

export default function ExtensaoPage() {
  return (
    <>
      <h1 className="page-title orange-text">Extensão</h1>
      <p className="page-sub">
        Instale no Opera ou Chrome, cole a URL do painel e a API Key.
      </p>
      <ExtensaoClient />
    </>
  );
}
