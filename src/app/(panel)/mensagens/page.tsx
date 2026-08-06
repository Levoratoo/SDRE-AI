import { MensagensClient } from "@/components/mensagens-client";

export default function MensagensPage() {
  return (
    <>
      <h1 className="page-title">Mensagens</h1>
      <p className="page-sub">
        Templates de DM com placeholders {"{primeiro_nome}"}, {"{nome}"},{" "}
        {"{username}"}.
      </p>
      <MensagensClient />
    </>
  );
}
