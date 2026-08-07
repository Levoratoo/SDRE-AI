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

  return <CampanhasClient leadsCount={leadsCount?.value ?? 0} />;
}
