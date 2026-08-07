import { MensagensClient } from "@/components/mensagens-client";

export default function MensagensPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Mensagens DM</h1>
          <p className="page-sub">
            Templates de Direct com placeholders personalizados.
          </p>
        </div>
      </div>
      <MensagensClient tipo="dm" />
    </>
  );
}
