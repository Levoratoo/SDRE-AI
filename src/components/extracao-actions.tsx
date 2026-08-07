"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExtracaoActions({
  id,
  canDelete,
  onDeleted,
}: {
  id: string;
  canDelete: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Excluir esta extração do histórico?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/extracoes/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Erro");
      onDeleted?.();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ gap: 10, flexDirection: "column", alignItems: "flex-start" }}>
      <Link className="action-pink" href={`/leads?extraction_id=${id}`}>
        Ver leads
      </Link>
      {canDelete ? (
        <button
          type="button"
          className="action-danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          Excluir
        </button>
      ) : null}
    </div>
  );
}
