import "server-only";

const IG_APP_ID = "936619743392459";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type IgSessionProfile = {
  username: string;
  pk: string;
  profilePicUrl: string | null;
};

export async function fetchIgCurrentUserFromSession(row: {
  sessionid: string;
  csrftoken?: string | null;
  dsUserId?: string | null;
  userAgent?: string | null;
}): Promise<IgSessionProfile | null> {
  const cookieParts = [`sessionid=${row.sessionid}`];
  if (row.csrftoken) cookieParts.push(`csrftoken=${row.csrftoken}`);
  if (row.dsUserId) cookieParts.push(`ds_user_id=${row.dsUserId}`);

  try {
    const res = await fetch(
      "https://www.instagram.com/api/v1/accounts/current_user/?edit=true",
      {
        headers: {
          Cookie: cookieParts.join("; "),
          "X-IG-App-ID": IG_APP_ID,
          "X-CSRFToken": row.csrftoken || "",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": row.userAgent || DEFAULT_UA,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      user?: {
        username?: string;
        pk?: number | string;
        id?: number | string;
        profile_pic_url?: string;
        profile_pic_url_hd?: string;
      };
    };
    const user = j.user;
    if (!user?.username) return null;
    return {
      username: user.username.replace(/^@/, "").toLowerCase(),
      pk: String(user.pk ?? user.id ?? row.dsUserId ?? ""),
      profilePicUrl:
        user.profile_pic_url_hd || user.profile_pic_url || null,
    };
  } catch {
    return null;
  }
}
