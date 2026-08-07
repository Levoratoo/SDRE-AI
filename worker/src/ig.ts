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

export async function openIgSession(session: IgSession): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      session.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const cookies = [
    {
      name: "sessionid",
      value: session.sessionid,
      domain: ".instagram.com",
      path: "/",
      httpOnly: true,
      secure: true,
    },
  ];
  if (session.csrftoken) {
    cookies.push({
      name: "csrftoken",
      value: session.csrftoken,
      domain: ".instagram.com",
      path: "/",
      httpOnly: false,
      secure: true,
    } as (typeof cookies)[0]);
  }
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

export async function fetchProfile(page: Page, username: string): Promise<IgProfile> {
  await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  const data = await page.evaluate(async (u) => {
    const r = await fetch(
      `/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`,
      { credentials: "include", headers: { "X-IG-App-ID": "936619743392459" } },
    );
    if (!r.ok) throw new Error("profile_http_" + r.status);
    return r.json();
  }, username);
  const user = data?.data?.user;
  if (!user) throw new Error("profile_not_found");
  return {
    pk: String(user.id),
    username: user.username,
    full_name: user.full_name || "",
    followers_count:
      (user.edge_followed_by && user.edge_followed_by.count) ||
      user.follower_count ||
      0,
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
  const pkParam = encodeURIComponent(pk);
  const result = await page.evaluate(
    async ({ pkParam, maxId }) => {
      const params = new URLSearchParams({
        count: "50",
        search_surface: "follow_list_page",
      });
      if (maxId) params.set("max_id", maxId);
      const r = await fetch(
        "/api/v1/friendships/" + pkParam + "/followers/?" + params.toString(),
        {
          credentials: "include",
          headers: { "X-IG-App-ID": "936619743392459" },
        },
      );
      if (!r.ok) throw new Error("followers_http_" + r.status);
      return r.json();
    },
    { pkParam, maxId },
  );

  const users = (result.users || []).map((u: Record<string, unknown>) => ({
    pk: String(u.pk || u.id),
    username: String(u.username || ""),
    full_name: String(u.full_name || ""),
    is_private: !!u.is_private,
    is_verified: !!u.is_verified,
    is_business: !!u.is_business,
  }));
  return {
    users,
    next_max_id: result.next_max_id ? String(result.next_max_id) : null,
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

/** Envia DM: abre perfil → mensagem → digita como humano → envia → fecha chat. */
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
  // Garante que estamos no perfil (não no chat)
  if (!page.url().includes(`/${username}`)) {
    await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
  } else {
    await closeDirectChat(page);
    await page.waitForTimeout(800);
  }

  const result = await evalInPage<true | false | "already">(page, CLICK_FOLLOW_SRC);
  await page.waitForTimeout(1500);
  if (result === "already") return true;
  return !!result;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function randBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * Math.max(0, max - min));
}
