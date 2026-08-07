import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.userId, session.user.id))
    .orderBy(desc(leads.capturadoEm))
    .limit(5000);

  const header = ["username", "full_name", "is_private", "is_verified", "is_business", "capturado_em"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.username,
        JSON.stringify(r.fullName || ""),
        r.isPrivate ? "1" : "0",
        r.isVerified ? "1" : "0",
        r.isBusiness ? "1" : "0",
        r.capturadoEm?.toISOString() || "",
      ].join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
    },
  });
}
