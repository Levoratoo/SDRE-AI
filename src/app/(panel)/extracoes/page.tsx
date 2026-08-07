import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ExtracaoQueueForm } from "@/components/extracao-queue-form";
import { ExtracoesLive } from "@/components/extracoes-live";
import { db } from "@/db";
import { extractions } from "@/db/schema";
import { requireSession } from "@/lib/session";

export default async function ExtracoesPage() {
  const session = await requireSession();
  const rows = await db
    .select()
    .from(extractions)
    .where(eq(extractions.userId, session.user.id))
    .orderBy(desc(extractions.iniciadoEm))
    .limit(100);

  const initial = rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    perfilAlvoUsername: r.perfilAlvoUsername,
    perfilAlvoSeguidores: r.perfilAlvoSeguidores,
    capturados: r.capturados,
    limite: r.limite,
    status: r.status,
    erroMensagem: r.erroMensagem,
    iniciadoEm: r.iniciadoEm?.toISOString() ?? null,
    finalizadoEm: r.finalizadoEm?.toISOString() ?? null,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title gradient-text">Extrações</h1>
          <p className="page-sub">
            Enfileire um @ aqui e acompanhe ao vivo. A VPS executa 24/7. Sessão
            IG em Minha Conta (colar sessionid) — extensão não é obrigatória.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn primary" href="#nova-extracao">
            Enfileirar @
          </Link>
        </div>
      </div>

      <div id="nova-extracao">
        <ExtracaoQueueForm />
      </div>

      <ExtracoesLive initial={initial} />
    </>
  );
}
