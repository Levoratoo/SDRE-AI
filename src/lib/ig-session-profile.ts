import "server-only";

const IG_APP_ID = "936619743392459";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Instagram 279.0.0.18.115 Android (29/10; 420dpi; 1080x2130; samsung; SM-G973F; beyond1; exynos9820; pt_BR; 458229237)";

export type IgSessionProfile = {
  username: string;
  pk: string;
  profilePicUrl: string | null;
};

function buildCookieHeader(row: {
  sessionid: string;
  csrftoken?: string | null;
  dsUserId?: string | null;
  mid?: string | null;
  igDid?: string | null;
  rur?: string | null;
}): string {
  const parts = [`sessionid=${row.sessionid}`];
  if (row.csrftoken) parts.push(`csrftoken=${row.csrftoken}`);
  if (row.dsUserId) parts.push(`ds_user_id=${row.dsUserId}`);
  if (row.mid) parts.push(`mid=${row.mid}`);
  if (row.igDid) parts.push(`ig_did=${row.igDid}`);
  if (row.rur) parts.push(`rur=${row.rur}`);
  return parts.join("; ");
}

function parseUserPayload(user: {
  username?: string;
  pk?: number | string;
  id?: number | string;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
}): IgSessionProfile | null {
  if (!user?.username) return null;
  return {
    username: user.username.replace(/^@/, "").toLowerCase(),
    pk: String(user.pk ?? user.id ?? ""),
    profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || null,
  };
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchIgCurrentUserFromSession(row: {
  sessionid: string;
  csrftoken?: string | null;
  dsUserId?: string | null;
  mid?: string | null;
  igDid?: string | null;
  rur?: string | null;
  userAgent?: string | null;
}): Promise<IgSessionProfile | null> {
  const cookie = buildCookieHeader(row);
  const ua = row.userAgent || DEFAULT_UA;

  const current = await fetchJson(
    "https://www.instagram.com/api/v1/accounts/current_user/?edit=true",
    {
      Cookie: cookie,
      "X-IG-App-ID": IG_APP_ID,
      "X-CSRFToken": row.csrftoken || "",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": ua,
      Accept: "*/*",
    },
  );
  const fromCurrent = parseUserPayload(
    (current?.user as Parameters<typeof parseUserPayload>[0]) || undefined,
  );
  if (fromCurrent) {
    if (!fromCurrent.pk && row.dsUserId) fromCurrent.pk = row.dsUserId;
    return fromCurrent;
  }

  const pk = row.dsUserId?.trim();
  if (!pk) return null;

  const mobile = await fetchJson(
    `https://i.instagram.com/api/v1/users/${encodeURIComponent(pk)}/info/`,
    {
      Cookie: cookie,
      "User-Agent": MOBILE_UA,
      "X-IG-App-ID": IG_APP_ID,
      Accept: "*/*",
    },
  );
  const fromMobile = parseUserPayload(
    (mobile?.user as Parameters<typeof parseUserPayload>[0]) || undefined,
  );
  if (fromMobile) {
    if (!fromMobile.pk) fromMobile.pk = pk;
    return fromMobile;
  }

  const web = await fetchJson(
    `https://www.instagram.com/api/v1/users/${encodeURIComponent(pk)}/info/`,
    {
      Cookie: cookie,
      "X-IG-App-ID": IG_APP_ID,
      "X-CSRFToken": row.csrftoken || "",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": ua,
      Accept: "*/*",
    },
  );
  const fromWeb = parseUserPayload(
    (web?.user as Parameters<typeof parseUserPayload>[0]) || undefined,
  );
  if (fromWeb) {
    if (!fromWeb.pk) fromWeb.pk = pk;
    return fromWeb;
  }

  return null;
}
