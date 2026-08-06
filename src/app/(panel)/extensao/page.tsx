import { ExtensaoClient } from "@/components/extensao-client";

export default function ExtensaoPage() {
  return (
    <>
      <h1 className="page-title">Extensão</h1>
      <p className="page-sub">
        Conecte a extensão Opera/Chrome ao seu painel Levorato Prospect.
      </p>
      <ExtensaoClient />
    </>
  );
}
