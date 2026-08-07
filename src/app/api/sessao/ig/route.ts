import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { igSessions } from "@/db/schema";
import { fetchIgCurrentUserFromSession } from "@/lib/ig-session-profile";
import { parseIgSessionInput } from "@/lib/ig-session-parse";
import { getSession } from "@/lib/session";

async function enrichSessionRow(
  userId: string,
  row: {
    id: string;
    sessionid: string;
    csrftoken: string | null;
    dsUserId: string | null;
    userAgent: string | null;
    igUsername: string | null;
    igUserPk: string | null;
    igProfilePicUrl: string | null;
    syncedAt: Date;
  },
) {
  let username = row.igUsername;
  let pk = row.igUserPk || row.dsUserId;
  let pic = row.igProfilePicUrl;

  if (!username || !pic) {
    const live = await fetchIgCurrentUserFromSession(row);
    if (live) {
      username = username || live.username;
      pk = pk || live.pk;
      pic = pic || live.profilePicUrl;
      if (
        username !== row.igUsername ||
        pk !== row.igUserPk ||
        pic !== row.igProfilePicUrl
      ) {
        await db
          .update(igSessions)
          .set({
            igUsername: username?.slice(0, 120) ?? row.igUsername,
            igUserPk: pk ?? row.igUserPk,
            igProfilePicUrl: pic ?? row.igProfilePicUrl,
          })
          .where(eq(igSessions.id, row.id));
      }
    }
  }

  return {
    igUsername: username,
    igUserPk: pk,
    igProfilePicUrl: pic,
    syncedAt: row.syncedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const [row] = await db
    .select()
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

  const sessao = await enrichSessionRow(session.user.id, row);

  return NextResponse.json({
    ok: true,
    conectado: true,
    sessao,
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
    ig_profile_pic_url?: string;
  };

  const parsed = parseIgSessionInput(body.cookies || "", {
    username: body.username,
    userAgent:
      body.userAgent ||
      (typeof req.headers.get("user-agent") === "string"
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

  const live = await fetchIgCurrentUserFromSession({
    sessionid: values.sessionid,
    csrftoken: values.csrftoken,
    dsUserId: values.dsUserId,
    mid: values.mid,
    igDid: values.igDid,
    rur: values.rur,
    userAgent: values.userAgent,
  });
  if (live) {
    values.igUsername = live.username;
    values.igUserPk = live.pk;
  } else if (body.username) {
    values.igUsername = body.username.replace(/^@/, "").toLowerCase();
  }

  const profilePicUrl =
    live?.profilePicUrl ||
    body.ig_profile_pic_url ||
    null;

  const [existing] = await db
    .select({ id: igSessions.id })
    .from(igSessions)
    .where(eq(igSessions.userId, session.user.id))
    .limit(1);

  let saved;
  if (existing) {
    [saved] = await db
      .update(igSessions)
      .set({
        ...values,
        igProfilePicUrl: profilePicUrl,
      })
      .where(eq(igSessions.userId, session.user.id))
      .returning();
  } else {
    [saved] = await db
      .insert(igSessions)
      .values({
        userId: session.user.id,
        ...values,
        igProfilePicUrl: profilePicUrl,
      })
      .returning();
  }

  const sessao = saved
    ? await enrichSessionRow(session.user.id, saved)
    : null;

  return NextResponse.json({
    ok: true,
    igUsername: sessao?.igUsername,
    syncedAt: sessao?.syncedAt,
    sessao,
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
