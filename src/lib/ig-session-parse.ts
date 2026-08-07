export type ParsedIgSession = {
  sessionid: string;
  csrftoken: string | null;
  ds_user_id: string | null;
  mid: string | null;
  ig_did: string | null;
  rur: string | null;
  user_agent: string | null;
  ig_username: string | null;
};

const COOKIE_KEYS = [
  "sessionid",
  "csrftoken",
  "ds_user_id",
  "mid",
  "ig_did",
  "rur",
] as const;

function pick(map: Record<string, string>, key: string): string | null {
  const v = map[key] || map[key.toLowerCase()] || "";
  const t = v.trim();
  return t || null;
}

/** Aceita: sessionid puro, header Cookie, linhas key=value, JSON de cookies. */
export function parseIgSessionInput(
  raw: string,
  extras?: { username?: string; userAgent?: string },
): ParsedIgSession | { error: string } {
  const text = (raw || "").trim();
  if (!text) return { error: "Cole o sessionid ou os cookies do Instagram." };

  const map: Record<string, string> = {};

  // JSON array (EditThisCookie / Cookie-Editor)
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as
        | { name?: string; value?: string }[]
        | Record<string, string>
        | { cookies?: { name?: string; value?: string }[] };
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { cookies?: unknown }).cookies)
          ? (parsed as { cookies: { name?: string; value?: string }[] }).cookies
          : null;
      if (list) {
        for (const c of list) {
          if (c?.name && c.value != null) map[String(c.name)] = String(c.value);
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed as Record<string, string>)) {
          if (typeof v === "string") map[k] = v;
        }
      }
    } catch {
      return { error: "JSON de cookies inválido." };
    }
  } else if (!text.includes("=") && !text.includes(";")) {
    // só o valor do sessionid
    map.sessionid = text;
  } else {
    // Cookie header ou várias linhas name=value
    const chunks = text.split(/[\n;]/).map((s) => s.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const eq = chunk.indexOf("=");
      if (eq <= 0) continue;
      const name = chunk.slice(0, eq).trim();
      let value = chunk.slice(eq + 1).trim();
      // remove aspas
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (COOKIE_KEYS.includes(name as (typeof COOKIE_KEYS)[number]) || name) {
        map[name] = value;
      }
    }
  }

  const sessionid = pick(map, "sessionid");
  if (!sessionid) {
    return {
      error:
        "Não encontrei sessionid. No Chrome: F12 → Application → Cookies → instagram.com → sessionid.",
    };
  }

  const username = (extras?.username || "").trim().replace(/^@/, "") || null;

  return {
    sessionid,
    csrftoken: pick(map, "csrftoken"),
    ds_user_id: pick(map, "ds_user_id"),
    mid: pick(map, "mid"),
    ig_did: pick(map, "ig_did"),
    rur: pick(map, "rur"),
    user_agent: (extras?.userAgent || "").trim() || null,
    ig_username: username,
  };
}
