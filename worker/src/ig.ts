import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { igSessions } from "./db";

export type IgSession = typeof igSessions.$inferSelect;

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type IgProfile = {
  username: string;
  pk: number;
  full_name: string;
  followers_count: number;
  is_private: boolean;
  is_verified: boolean;
  is_business: boolean;
};

export type IgFollower = {
  pk: number;
  username: string;
  full_name: string;
  is_private: boolean;
  is_verified: boolean;
  is_business: boolean;
};

/**
 * page.evaluate com source string — o tsx/esbuild injeta __name em arrow
 * functions e isso quebra no browser (ReferenceError: __name is not defined).
 */
async function evalInPage<T>(page: Page, source: string, arg?: unknown): Promise<T> {
  if (arguments.length < 3) {
    return page.evaluate(source) as Promise<T>;
  }
  return page.evaluate(source, arg) as Promise<T>;
}

export async function openIgSession(session: IgSession): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const headless = process.env.HEADLESS !== "false";
  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent: session.userAgent || DEFAULT_UA,
    locale: "pt-BR",
    viewport: { width: 1280, height: 800 },
  });

  const cookies = [
    { name: "sessionid", value: session.sessionid },
    session.csrftoken ? { name: "csrftoken", value: session.csrftoken } : null,
    session.dsUserId ? { name: "ds_user_id", value: session.dsUserId } : null,
    session.mid ? { name: "mid", value: session.mid } : null,
    session.igDid ? { name: "ig_did", value: session.igDid } : null,
    session.rur ? { name: "rur", value: session.rur } : null,
  ]
    .filter(Boolean)
    .map((c) => ({
      name: (c as { name: string; value: string }).name,
      value: (c as { name: string; value: string }).value,
      domain: ".instagram.com",
      path: "/",
    }));

  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  const url = page.url();
  if (/\/accounts\/login|\/challenge\//i.test(url)) {
    await browser.close();
    throw new Error("sessao_ig_invalida_ou_challenge");
  }

  return { browser, context, page };
}

const FETCH_PROFILE_SRC = `async (u) => {
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : "";
  };
  const csrf = getCookie("csrftoken");
  const headers = {
    "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "129477",
    "X-Requested-With": "XMLHttpRequest",
    "X-CSRFToken": csrf,
    Accept: "*/*",
  };
  const r = await fetch(
    "/api/v1/users/web_profile_info/?username=" + encodeURIComponent(u),
    { headers: headers, credentials: "include" },
  );
  if (!r.ok) return { __error: "HTTP " + r.status };
  const j = await r.json();
  const user = j && j.data && j.data.user;
  if (!user || !user.id) return { __error: "sem_user" };
  return {
    username: user.username,
    pk: Number(user.id),
    full_name: user.full_name || "",
    followers_count: (user.edge_followed_by && user.edge_followed_by.count) || user.follower_count || 0,
    is_private: !!user.is_private,
    is_verified: !!user.is_verified,
    is_business: !!(user.is_business_account || user.is_business),
  };
}`;

export async function fetchProfile(page: Page, username: string): Promise<IgProfile> {
  const result = await evalInPage<{ __error?: string } & Partial<IgProfile>>(
    page,
    FETCH_PROFILE_SRC,
    username,
  );

  if (result.__error) {
    throw new Error("perfil: " + result.__error);
  }
  return result as IgProfile;
}

const FETCH_FOLLOWERS_SRC = `async ({ pkParam, maxIdParam }) => {
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : "";
  };
  const csrf = getCookie("csrftoken");
  const params = new URLSearchParams({
    count: "50",
    search_surface: "follow_list_page",
  });
  if (maxIdParam) params.append("max_id", maxIdParam);
  const r = await fetch(
    "/api/v1/friendships/" + pkParam + "/followers/?" + params.toString(),
    {
      headers: {
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrf,
      },
      credentials: "include",
    },
  );
  if (r.status === 401 || r.status === 403) return { __error: "AUTH" };
  if (r.status === 429) return { __error: "RATE" };
  if (!r.ok) return { __error: "HTTP:" + r.status };
  const j = await r.json();
  return {
    users: (j.users || []).map((u) => ({
      pk: Number(u.pk || u.id),
      username: u.username,
      full_name: u.full_name || "",
      is_private: !!u.is_private,
      is_verified: !!u.is_verified,
      is_business: !!u.is_business,
    })),
    next_max_id: j.next_max_id || null,
  };
}`;

export async function fetchFollowersPage(
  page: Page,
  pk: number,
  maxId: string | null,
): Promise<{ users: IgFollower[]; next_max_id: string | null }> {
  const result = await evalInPage<
    | { __error: string }
    | { users: IgFollower[]; next_max_id: string | null }
  >(page, FETCH_FOLLOWERS_SRC, { pkParam: pk, maxIdParam: maxId });

  if ("__error" in result && result.__error) {
    const code = result.__error;
    const err = new Error(code) as Error & { code?: string };
    err.code = code.startsWith("RATE")
      ? "RATE"
      : code.startsWith("AUTH")
        ? "AUTH"
        : "HTTP";
    throw err;
  }
  return result as { users: IgFollower[]; next_max_id: string | null };
}

const CLICK_DM_SRC = `() => {
  const nodes = Array.from(document.querySelectorAll("button, div[role='button'], a"));
  const match = nodes.find((el) =>
    /^(enviar mensagem|mensagem|message|send message)$/i.test(
      (el.textContent || "").trim(),
    ),
  );
  if (match) {
    match.click();
    return "direct";
  }
  const more = nodes.find((el) => {
    const label = el.getAttribute("aria-label") || "";
    return /opções|options|mais|more/i.test(label) || (el.textContent || "").trim() === "···";
  });
  if (more) {
    more.click();
    return "menu";
  }
  return null;
}`;

const CLICK_DM_MENU_SRC = `() => {
  const items = Array.from(document.querySelectorAll("button, div[role='button'], a"));
  const msg = items.find((el) =>
    /enviar mensagem|send message|mensagem/i.test((el.textContent || "").trim()),
  );
  if (!msg) return false;
  msg.click();
  return true;
}`;

const CLICK_FOLLOW_SRC = `() => {
  const nodes = Array.from(document.querySelectorAll("button"));
  const btn = nodes.find((b) => /^(seguir|follow)$/i.test((b.textContent || "").trim()));
  if (!btn) return false;
  btn.click();
  return true;
}`;

/** Envia DM abrindo o perfil e usando o botão de mensagem (DOM). */
export async function sendDm(page: Page, username: string, message: string) {
  await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);

  if (/\/accounts\/login|\/challenge\//i.test(page.url())) {
    throw Object.assign(new Error("sessao_deslogada"), { fatal: true });
  }

  const clicked = await evalInPage<"direct" | "menu" | null>(page, CLICK_DM_SRC);

  if (!clicked) throw new Error("sem_botao_mensagem");

  if (clicked === "menu") {
    await page.waitForTimeout(1000);
    const inMenu = await evalInPage<boolean>(page, CLICK_DM_MENU_SRC);
    if (!inMenu) throw new Error("menu_sem_enviar_mensagem");
  }

  await page.waitForTimeout(2000);
  const box = page.locator('div[role="textbox"], textarea').first();
  await box.waitFor({ timeout: 15000 });
  await box.click();
  await page.keyboard.type(message, { delay: 35 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  return true;
}

export async function followProfile(page: Page, username: string) {
  await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  const ok = await evalInPage<boolean>(page, CLICK_FOLLOW_SRC);
  await page.waitForTimeout(1500);
  return ok;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function randBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * Math.max(0, max - min));
}
