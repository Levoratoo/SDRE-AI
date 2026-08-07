import { LeadsClient } from "@/components/leads-client";
import { requireSession } from "@/lib/session";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ extraction_id?: string }>;
}) {
  await requireSession();
  const { extraction_id } = await searchParams;
  return <LeadsClient initialExtractionId={extraction_id} />;
}
