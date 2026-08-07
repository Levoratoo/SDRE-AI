import { eq } from "drizzle-orm";
import { db } from "@/db";
import { igSessions } from "@/db/schema";
import { fetchIgCurrentUserFromSession } from "@/lib/ig-session-profile";
import {
  jsonErro,
  jsonOk,
  readJsonBody,
  requireApiUser,
} from "@/lib/insta-api";

type Body = {
  sessionid?: string;
  csrftoken?: string;
  ds_user_id?: string;
  mid?: string;
  ig_did?: string;
  rur?: string;
  user_agent?: string;
  ig_username?: string | null;
  ig_user_pk?: number | string | null;
  ig_profile_pic_url?: string | null;
};

export async function POST(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;

  const body = await readJsonBody<Body>(req);
  if (!body?.sessionid) {
    return jsonErro("sessionid obrigatório");
  }

  let igUsername = body.ig_username?.replace(/^@/, "").toLowerCase() || null;
  let igUserPk =
    body.ig_user_pk != null && body.ig_user_pk !== ""
      ? String(body.ig_user_pk)
      : body.ds_user_id || null;
  let igProfilePicUrl = body.ig_profile_pic_url || null;

  const live = await fetchIgCurrentUserFromSession({
    sessionid: body.sessionid,
    csrftoken: body.csrftoken,
    dsUserId: body.ds_user_id,
    userAgent: body.user_agent,
  });
  if (live) {
    igUsername = live.username;
    igUserPk = live.pk;
    igProfilePicUrl = live.profilePicUrl || igProfilePicUrl;
  }

  const existing = await db
    .select({ id: igSessions.id })
    .from(igSessions)
    .where(eq(igSessions.userId, auth.user.id))
    .limit(1);

  const values = {
    sessionid: body.sessionid,
    csrftoken: body.csrftoken || null,
    dsUserId: body.ds_user_id || null,
    mid: body.mid || null,
    igDid: body.ig_did || null,
    rur: body.rur || null,
    userAgent: body.user_agent || null,
    igUsername,
    igUserPk,
    igProfilePicUrl,
    syncedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(igSessions)
      .set(values)
      .where(eq(igSessions.userId, auth.user.id));
  } else {
    await db.insert(igSessions).values({
      userId: auth.user.id,
      ...values,
    });
  }

  return jsonOk({
    ig_username: igUsername,
    ig_user_pk: igUserPk,
    ig_profile_pic_url: igProfilePicUrl,
  });
}
