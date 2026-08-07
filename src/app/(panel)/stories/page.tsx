import { MensagensClient } from "@/components/mensagens-client";

export default function StoriesPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Stories</h1>
          <p className="page-sub">
            Templates de resposta automática nos stories dos leads.
          </p>
        </div>
      </div>
      <MensagensClient tipo="storie" />
    </>
  );
}
