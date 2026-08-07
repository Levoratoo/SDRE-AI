import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaignDispatches, campaigns, leads } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const extractionId = url.searchParams.get("extraction_id");
  const statusFilter = url.searchParams.get("status"); // novo|enviado|falhou
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const offset = (page - 1) * limit;

  const conditions = [eq(leads.userId, session.user.id)];
  if (extractionId) conditions.push(eq(leads.extractionId, extractionId));
  if (q) {
    conditions.push(
      or(
        ilike(leads.username, `%${q}%`),
        ilike(leads.fullName, `%${q}%`),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.capturadoEm))
    .limit(limit)
    .offset(offset);

  const ids = rows.map((r) => r.id);
  const statusMap = new Map<string, "novo" | "enviado" | "falhou">();
  if (ids.length) {
    const dispatches = await db
      .select({
        leadId: campaignDispatches.leadId,
        status: campaignDispatches.status,
      })
      .from(campaignDispatches)
      .innerJoin(campaigns, eq(campaignDispatches.campaignId, campaigns.id))
      .where(
        and(eq(campaigns.userId, session.user.id), inArray(campaignDispatches.leadId, ids)),
      );

    for (const id of ids) statusMap.set(id, "novo");
    for (const d of dispatches) {
      const cur = statusMap.get(d.leadId) || "novo";
      if (d.status === "sent") statusMap.set(d.leadId, "enviado");
      else if (d.status === "error" && cur !== "enviado") {
        statusMap.set(d.leadId, "falhou");
      }
    }
  }

  let items = rows.map((r) => ({
    ...r,
    status_disparo: statusMap.get(r.id) || "novo",
  }));

  if (statusFilter === "novo" || statusFilter === "enviado" || statusFilter === "falhou") {
    items = items.filter((r) => r.status_disparo === statusFilter);
  }

  const [countRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...conditions));

  return NextResponse.json({
    ok: true,
    leads: items,
    page,
    limit,
    total: countRow?.value ?? items.length,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { usernames?: string[] };
  const raw = Array.isArray(body.usernames) ? body.usernames : [];
  const usernames = [
    ...new Set(
      raw
        .map((u) => String(u).replace(/^@/, "").trim().toLowerCase())
        .filter((u) => /^[a-z0-9._]{1,30}$/.test(u)),
    ),
  ].slice(0, 500);

  if (!usernames.length) {
    return NextResponse.json({ ok: false, erro: "Nenhum username válido" }, { status: 400 });
  }

  let inserted = 0;
  for (const username of usernames) {
    const pk = `manual:${username}`;
    try {
      await db
        .insert(leads)
        .values({
          userId: session.user.id,
          pk,
          username,
          fullName: null,
        })
        .onConflictDoNothing();
      inserted += 1;
    } catch {
      // ignore dupes
    }
  }

  return NextResponse.json({ ok: true, inseridos: inserted, total: usernames.length });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) {
    return NextResponse.json({ ok: false, erro: "ids obrigatório" }, { status: 400 });
  }

  await db
    .delete(leads)
    .where(and(eq(leads.userId, session.user.id), inArray(leads.id, ids)));

  return NextResponse.json({ ok: true, removidos: ids.length });
}
