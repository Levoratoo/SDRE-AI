import { ExtensaoClient } from "@/components/extensao-client";

export default function DownloadsPage() {
  return (
    <>
      <h1 className="page-title gradient-text">Downloads</h1>
      <p className="page-sub">
        Baixe a extensão do Chrome e instale para sincronizar sua sessão do
        Instagram com o painel.
      </p>
      <ExtensaoClient />
    </>
  );
}
