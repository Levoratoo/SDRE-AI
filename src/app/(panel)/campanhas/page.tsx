import { count, eq } from "drizzle-orm";
import { CampanhasClient } from "@/components/campanhas-client";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireSession } from "@/lib/session";

export default async function CampanhasPage() {
  const session = await requireSession();
  const [leadsCount] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.userId, session.user.id));

  return (
    <>
      <h1 className="page-title">Campanhas</h1>
      <p className="page-sub">
        Crie a fila, aperte Play — o worker na VPS dispara 24/7.
      </p>
      <CampanhasClient leadsCount={leadsCount?.value ?? 0} />
    </>
  );
}
