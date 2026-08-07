import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { igSessions } from "@/db/schema";
import { parseIgSessionInput } from "@/lib/ig-session-parse";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const [row] = await db
    .select({
      igUsername: igSessions.igUsername,
      igUserPk: igSessions.igUserPk,
      dsUserId: igSessions.dsUserId,
      syncedAt: igSessions.syncedAt,
      sessionid: igSessions.sessionid,
      csrftoken: igSessions.csrftoken,
    })
    .from(igSessions)
    .where(eq(igSessions.userId, session.user.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({
      ok: true,
      conectado: false,
      sessao: null,
    });
  }

  const sid = row.sessionid || "";
  const masked =
    sid.length > 12 ? `${sid.slice(0, 6)}…${sid.slice(-4)}` : "••••";

  return NextResponse.json({
    ok: true,
    conectado: true,
    sessao: {
      igUsername: row.igUsername,
      igUserPk: row.igUserPk || row.dsUserId,
      syncedAt: row.syncedAt?.toISOString() ?? null,
      sessionidMasked: masked,
      temCsrf: !!row.csrftoken,
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    cookies?: string;
    username?: string;
    userAgent?: string;
  };

  const parsed = parseIgSessionInput(body.cookies || "", {
    username: body.username,
    userAgent: body.userAgent || (typeof req.headers.get("user-agent") === "string"
      ? req.headers.get("user-agent") || undefined
      : undefined),
  });

  if ("error" in parsed) {
    return NextResponse.json({ ok: false, erro: parsed.error }, { status: 400 });
  }

  const values = {
    sessionid: parsed.sessionid,
    csrftoken: parsed.csrftoken,
    dsUserId: parsed.ds_user_id,
    mid: parsed.mid,
    igDid: parsed.ig_did,
    rur: parsed.rur,
    userAgent: parsed.user_agent,
    igUsername: parsed.ig_username,
    igUserPk: parsed.ds_user_id,
    syncedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: igSessions.id })
    .from(igSessions)
    .where(eq(igSessions.userId, session.user.id))
    .limit(1);

  if (existing) {
    await db
      .update(igSessions)
      .set(values)
      .where(eq(igSessions.userId, session.user.id));
  } else {
    await db.insert(igSessions).values({
      userId: session.user.id,
      ...values,
    });
  }

  return NextResponse.json({
    ok: true,
    igUsername: values.igUsername,
    syncedAt: values.syncedAt.toISOString(),
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  await db.delete(igSessions).where(eq(igSessions.userId, session.user.id));
  return NextResponse.json({ ok: true });
}
