import { AgenteClient } from "@/components/agente-client";

export default function AgentePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Agente de Atendimento</h1>
          <p className="page-sub">
            Configure um agente de IA para responder mensagens no Direct
            automaticamente.
          </p>
        </div>
      </div>
      <AgenteClient />
    </>
  );
}
