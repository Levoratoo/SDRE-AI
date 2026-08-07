import { MensagensClient } from "@/components/mensagens-client";

export default function MensagensPage() {
  return (
    <>
      <h1 className="page-title orange-text">Mensagens (DM)</h1>
      <p className="page-sub">
        Templates de Direct Message com placeholders {"{primeiro_nome}"},{" "}
        {"{nome}"}, {"{username}"}.
      </p>
      <MensagensClient />
    </>
  );
}
