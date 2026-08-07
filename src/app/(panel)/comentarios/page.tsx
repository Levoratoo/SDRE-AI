import { MensagensClient } from "@/components/mensagens-client";

export default function ComentariosPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Comentários</h1>
          <p className="page-sub">
            Templates de comentário automático nos posts dos leads.
          </p>
        </div>
      </div>
      <MensagensClient tipo="comment" />
    </>
  );
}
