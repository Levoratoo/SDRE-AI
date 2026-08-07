import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { igSessions } from "./db";

export type IgSession = typeof igSessions.$inferSelect;

export type IgProfile = {
  pk: string;
  username: string;
  full_name: string;
  followers_count: number;
  is_private: boolean;
  is_verified: boolean;
  is_business: boolean;
};

export type IgFollower = {
  pk: string;
  username: string;
  full_name: string;
  is_private: boolean;
  is_verified: boolean;
  is_business: boolean;
};

function cookieEntry(
  name: string,
  value: string,
  httpOnly = false,
): {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
} {
  return {
    name,
    value,
    domain: ".instagram.com",
    path: "/",
    httpOnly,
    secure: true,
  };
}

export async function openIgSession(session: IgSession): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const headless = String(process.env.HEADLESS ?? "true").toLowerCase() !== "false";
  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      session.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const cookies = [cookieEntry("sessionid", session.sessionid, true)];
  if (session.csrftoken) cookies.push(cookieEntry("csrftoken", session.csrftoken));
  if (session.dsUserId) cookies.push(cookieEntry("ds_user_id", session.dsUserId));
  if (session.mid) cookies.push(cookieEntry("mid", session.mid));
  if (session.igDid) cookies.push(cookieEntry("ig_did", session.igDid));
  if (session.rur) cookies.push(cookieEntry("rur", session.rur));

  await context.addCookies(cookies);
  const page = await context.newPage();
  return { browser, context, page };
}

/** Avalia JS no browser sem o helper __name do tsx (bug conhecido). */
async function evalInPage<T>(page: Page, fnBody: string, arg?: unknown): Promise<T> {
  if (arg === undefined) {
    return page.evaluate(`(${fnBody})()`) as Promise<T>;
  }
  return page.evaluate(`(${fnBody})(${JSON.stringify(arg)})`) as Promise<T>;
}

function httpError(status: number, prefix: string): Error {
  const err = new Error(`${prefix}_${status}`) as Error & { code?: string };
  if (status === 401 || status === 403) err.code = "AUTH";
  else if (status === 429) err.code = "RATE";
  return err;
}

export async function fetchProfile(page: Page, username: string): Promise<IgProfile> {
  await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  if (/\/accounts\/login|\/challenge\//i.test(page.url())) {
    throw Object.assign(new Error("sessao_deslogada"), { code: "AUTH", fatal: true });
  }

  const data = await evalInPage<{
    ok: boolean;
    status: number;
    json: Record<string, unknown> | null;
  }>(
    page,
    `async (u) => {
      const r = await fetch(
        '/api/v1/users/web_profile_info/?username=' + encodeURIComponent(u),
        { credentials: 'include', headers: { 'X-IG-App-ID': '936619743392459' } },
      );
      let json = null;
      try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, json };
    }`,
    username,
  );

  if (!data.ok) throw httpError(data.status, "profile_http");
  const user = (data.json as { data?: { user?: Record<string, unknown> } })?.data?.user;
  if (!user) throw new Error("profile_not_found");
  const edge = user.edge_followed_by as { count?: number } | undefined;
  return {
    pk: String(user.id),
    username: String(user.username || username),
    full_name: String(user.full_name || ""),
    followers_count: edge?.count || Number(user.follower_count) || 0,
    is_private: !!user.is_private,
    is_verified: !!user.is_verified,
    is_business: !!user.is_business_account,
  };
}

export async function fetchFollowersPage(
  page: Page,
  pk: string,
  maxId: string | null,
): Promise<{ users: IgFollower[]; next_max_id: string | null }> {
  const result = await evalInPage<{
    ok: boolean;
    status: number;
    json: {
      users?: Record<string, unknown>[];
      next_max_id?: string | number | null;
    } | null;
  }>(
    page,
    `async ({ pk, maxId }) => {
      const params = new URLSearchParams({
        count: '50',
        search_surface: 'follow_list_page',
      });
      if (maxId) params.set('max_id', maxId);
      const r = await fetch(
        '/api/v1/friendships/' + encodeURIComponent(pk) + '/followers/?' + params.toString(),
        {
          credentials: 'include',
          headers: { 'X-IG-App-ID': '936619743392459' },
        },
      );
      let json = null;
      try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, json };
    }`,
    { pk, maxId },
  );

  if (!result.ok) throw httpError(result.status, "followers_http");
  const users = (result.json?.users || []).map((u) => ({
    pk: String(u.pk || u.id),
    username: String(u.username || ""),
    full_name: String(u.full_name || ""),
    is_private: !!u.is_private,
    is_verified: !!u.is_verified,
    is_business: !!u.is_business,
  }));
  const next = result.json?.next_max_id;
  return {
    users,
    next_max_id: next != null && String(next) ? String(next) : null,
  };
}

const CLICK_DM_SRC = `() => {
  const nodes = Array.from(document.querySelectorAll("button, div[role='button'], a"));
  const direct = nodes.find((el) =>
    /^(enviar mensagem|send message|mensagem)$/i.test((el.textContent || "").trim()),
  );
  if (direct) { direct.click(); return "direct"; }
  const opts = Array.from(document.querySelectorAll("svg[aria-label]")).find((svg) =>
    /^(options|more options|mais opções|opções|more)$/i.test(svg.getAttribute("aria-label") || ""),
  );
  if (opts) {
    const btn = opts.closest("button, [role='button'], a");
    if (btn) { btn.click(); return "menu"; }
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
  const ja = nodes.find((b) => /^(seguindo|following|solicitado|requested)$/i.test((b.textContent || "").trim()));
  if (ja) return "already";
  const btn = nodes.find((b) => /^(seguir|follow|seguir de volta|follow back)$/i.test((b.textContent || "").trim()));
  if (!btn) return false;
  btn.click();
  return true;
}`;

const OPEN_FIRST_POST_SRC = `() => {
  const links = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
  const visible = links.find((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 40 && r.height > 40;
  });
  if (!visible) return false;
  visible.click();
  return true;
}`;

const LIKE_POST_SRC = `() => {
  const svgs = Array.from(document.querySelectorAll('svg[aria-label]'));
  for (const svg of svgs) {
    const label = (svg.getAttribute('aria-label') || '').trim();
    if (/^(descurtir|unlike)$/i.test(label)) return 'already';
    if (/^(curtir|like)$/i.test(label)) {
      const btn = svg.closest('button, [role="button"]') || svg.parentElement;
      if (btn) { btn.click(); return true; }
    }
  }
  return false;
}`;

const COMMENT_FOCUS_SRC = `() => {
  const nodes = Array.from(document.querySelectorAll('textarea, div[role="textbox"], div[contenteditable="true"]'));
  const box = nodes.find((el) => {
    const aria = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '');
    return /coment|comment/i.test(aria);
  }) || nodes.find((el) => /coment|comment/i.test(el.getAttribute('placeholder') || ''));
  if (!box) {
    const body = (document.body.innerText || '').toLowerCase();
    if (/coment[áa]rios? (foram )?desativad|comments (are|have been) turned off/.test(body)) {
      return 'disabled';
    }
    return null;
  }
  box.click();
  return true;
}`;

const HAS_STORY_SRC = `(username) => {
  const u = (username || '').toLowerCase();
  const nodes = Array.from(document.querySelectorAll('[aria-label], canvas, header img, header a'));
  for (const el of nodes) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (/story|storie|hist[óo]ria/.test(aria) && (aria.includes(u) || aria.length < 80)) {
      return true;
    }
  }
  const canvas = document.querySelector('header canvas');
  return !!canvas;
}`;

const OPEN_STORY_SRC = `(username) => {
  const u = (username || '').toLowerCase();
  const candidates = Array.from(document.querySelectorAll('header a, header button, header [role="button"], [aria-label]'));
  for (const el of candidates) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (/story|storie|hist[óo]ria/.test(aria) && (aria.includes(u) || aria.length < 80)) {
      el.click();
      return true;
    }
  }
  const img = document.querySelector('header img');
  if (img) {
    const clickable = img.closest('a, button, [role="button"]') || img;
    clickable.click();
    return true;
  }
  return false;
}`;

const STORY_REPLY_FOCUS_SRC = `() => {
  const nodes = Array.from(document.querySelectorAll('textarea, div[role="textbox"], div[contenteditable="true"]'));
  const box = nodes.find((el) => {
    const aria = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
    return /respond|reply|mensagem|message/i.test(aria);
  }) || nodes[0];
  if (!box) return false;
  box.click();
  return true;
}`;

async function typeLikeHuman(page: Page, text: string) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    await page.keyboard.type(ch, { delay: 0 });
    let delay = 45 + Math.random() * 90;
    if (ch === " ") delay += 80 + Math.random() * 160;
    if (/[.,!?;:]/.test(ch)) delay += 120 + Math.random() * 220;
    if (i > 0 && i % (12 + Math.floor(Math.random() * 10)) === 0) {
      delay += 250 + Math.random() * 450;
    }
    await page.waitForTimeout(delay);
  }
}

async function closeDirectChat(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
}

async function ensureOnProfile(page: Page, username: string) {
  if (!page.url().includes(`/${username}`)) {
    await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
  } else {
    await closeDirectChat(page);
    await page.waitForTimeout(600);
  }
  if (/\/accounts\/login|\/challenge\//i.test(page.url())) {
    throw Object.assign(new Error("sessao_deslogada"), { code: "AUTH", fatal: true });
  }
}

/** Envia DM: abre perfil → mensagem → digita como humano → envia → fecha chat. */
export async function sendDm(page: Page, username: string, message: string) {
  await ensureOnProfile(page, username);

  const clicked = await evalInPage<"direct" | "menu" | null>(page, CLICK_DM_SRC);

  if (!clicked) throw new Error("sem_botao_mensagem");

  if (clicked === "menu") {
    await page.waitForTimeout(1000);
    const inMenu = await evalInPage<boolean>(page, CLICK_DM_MENU_SRC);
    if (!inMenu) throw new Error("menu_sem_enviar_mensagem");
  }

  await page.waitForTimeout(2000);
  const box = page.locator('div[role="textbox"], textarea, div[contenteditable="true"]').first();
  await box.waitFor({ timeout: 15000 });
  await box.click();
  await page.waitForTimeout(600 + Math.random() * 400);
  await typeLikeHuman(page, message);
  await page.waitForTimeout(700 + Math.random() * 500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200 + Math.random() * 800);
  await closeDirectChat(page);
  await page.waitForTimeout(800);
  return true;
}

export async function followProfile(page: Page, username: string) {
  await ensureOnProfile(page, username);
  const result = await evalInPage<true | false | "already">(page, CLICK_FOLLOW_SRC);
  await page.waitForTimeout(1500);
  if (result === "already") return true;
  return !!result;
}

export async function likeLatestPost(page: Page, username: string): Promise<"sent" | "already" | "error"> {
  await ensureOnProfile(page, username);
  const opened = await evalInPage<boolean>(page, OPEN_FIRST_POST_SRC);
  if (!opened) return "error";
  await page.waitForTimeout(2000);
  const liked = await evalInPage<true | false | "already">(page, LIKE_POST_SRC);
  await page.waitForTimeout(1000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  if (liked === "already") return "already";
  return liked ? "sent" : "error";
}

export async function commentLatestPost(
  page: Page,
  username: string,
  text: string,
): Promise<"sent" | "disabled" | "error"> {
  await ensureOnProfile(page, username);
  const opened = await evalInPage<boolean>(page, OPEN_FIRST_POST_SRC);
  if (!opened) return "error";
  await page.waitForTimeout(2000);
  const focus = await evalInPage<true | "disabled" | null>(page, COMMENT_FOCUS_SRC);
  if (focus === "disabled") {
    await page.keyboard.press("Escape");
    return "disabled";
  }
  if (!focus) {
    await page.keyboard.press("Escape");
    return "error";
  }
  await page.waitForTimeout(400);
  await typeLikeHuman(page, text);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  return "sent";
}

export async function replyStory(
  page: Page,
  username: string,
  text: string,
): Promise<"sent" | "skipped" | "error"> {
  await ensureOnProfile(page, username);
  const has = await evalInPage<boolean>(page, HAS_STORY_SRC, username);
  if (!has) return "skipped";
  const opened = await evalInPage<boolean>(page, OPEN_STORY_SRC, username);
  if (!opened) return "error";
  await page.waitForTimeout(2500);
  const focused = await evalInPage<boolean>(page, STORY_REPLY_FOCUS_SRC);
  if (!focused) {
    await page.keyboard.press("Escape");
    return "error";
  }
  await page.waitForTimeout(400);
  await typeLikeHuman(page, text);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  return "sent";
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function randBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * Math.max(0, max - min));
}
