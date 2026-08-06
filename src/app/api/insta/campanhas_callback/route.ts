import { jsonOk, requireApiUser } from "@/lib/insta-api";

/**
 * Stub Fase 2 — a extensão consulta list_active ao abrir a aba Disparar.
 * Implementação completa na Fase 4.
 */
export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  if (action === "list_active") {
    return jsonOk({ campanhas: [] });
  }

  if (action === "stats_erros") {
    return jsonOk({ erros_por_motivo: [] });
  }

  if (action === "check_status") {
    return jsonOk({
      executavel: false,
      motivo: "campanhas_ainda_nao_implementadas",
    });
  }

  if (action === "next_lote") {
    return jsonOk({ fim_da_fila: true, leads: [] });
  }

  return jsonOk({ action, note: "stub" });
}

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;
  return jsonOk({ accepted: true, note: "stub_fase4" });
}
