import { and, asc, desc, eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/db";
import {
  agentMessages,
  agentSettings,
  campaignDispatches,
  campaigns,
} from "@/db/schema";
import { generateAgentReply } from "@/lib/openai";

type AgentRow = typeof agentSettings.$inferSelect;

type MetaMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
};

type MetaEntry = {
  id?: string;
  messaging?: MetaMessaging[];
};

async function findBySecret(secret: string) {
  const [row] = await db
    .select()
    .from(agentSettings)
    .where(eq(agentSettings.webhookSecret, secret))
    .limit(1);
  return row ?? null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ secret: string }> },
) {
  const { secret } = await ctx.params;
  const row = await findBySecret(secret);
  if (!row) {
    return new NextResponse("not found", { status: 404 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === row.verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ secret: string }> },
) {
  const { secret } = await ctx.params;
  const row = await findBySecret(secret);
  if (!row) {
    return new NextResponse("not found", { status: 404 });
  }

  const payload = (await req.json().catch(() => null)) as {
    object?: string;
    entry?: MetaEntry[];
  } | null;

  after(async () => {
    try {
      await processWebhook(row, payload);
    } catch (err) {
      console.error(
        "[agent webhook]",
        err instanceof Error ? err.message : "erro",
      );
    }
  });

  return NextResponse.json({ ok: true });
}

async function processWebhook(
  initial: AgentRow,
  payload: { object?: string; entry?: MetaEntry[] } | null,
) {
  let row = initial;
  if (!row.ativo) return;
  if (!payload || payload.object !== "instagram") return;
  const accessToken = row.metaAccessToken;
  const igBusinessId = row.metaIgBusinessId;
  if (!accessToken || !igBusinessId) return;

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      const text = event.message?.text?.trim();
      const senderId = event.sender?.id;
      if (!text || !senderId) continue;
      if (event.message?.is_echo) continue;
      if (senderId === igBusinessId) continue;

      const username = await resolveIgUsername(senderId, accessToken);

      if (!row.responderTodos) {
        if (!row.responderProspeccao) continue;
        if (!username) continue;
        const allowed = await wasProspected(row.userId, username);
        if (!allowed) continue;
      }

      if (username && (await shouldSkipRapidReply(row.userId, username))) {
        continue;
      }

      await ensureOutboundContext(row.userId, senderId, username);

      const historyRows = await db
        .select()
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.userId, row.userId),
            eq(agentMessages.igsid, senderId),
          ),
        )
        .orderBy(asc(agentMessages.criadoEm))
        .limit(20);

      const history = historyRows.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      await db.insert(agentMessages).values({
        userId: row.userId,
        igsid: senderId,
        username: username || null,
        role: "user",
        content: text,
      });

      const reply = await generateAgentReply({
        systemPrompt: row.prompt || "",
        userMessage: text,
        history,
      });

      await sendIgMessage({
        igBusinessId,
        accessToken,
        recipientId: senderId,
        text: reply,
      });

      await db.insert(agentMessages).values({
        userId: row.userId,
        igsid: senderId,
        username: username || null,
        role: "assistant",
        content: reply,
      });

      const nextTotal = row.totalMensagens + 1;
      await db
        .update(agentSettings)
        .set({
          totalMensagens: nextTotal,
          ultimaMsgEm: new Date(),
          atualizadoEm: new Date(),
        })
        .where(eq(agentSettings.id, row.id));

      row = { ...row, totalMensagens: nextTotal };
    }
  }
}

/** Se ainda não há histórico, injeta o DM da campanha como contexto da IA. */
async function ensureOutboundContext(
  userId: string,
  igsid: string,
  username: string | null,
) {
  const [existing] = await db
    .select({ id: agentMessages.id })
    .from(agentMessages)
    .where(
      and(eq(agentMessages.userId, userId), eq(agentMessages.igsid, igsid)),
    )
    .limit(1);
  if (existing) return;
  if (!username) return;

  const [outbound] = await db
    .select({
      mensagemRender: campaignDispatches.mensagemRender,
    })
    .from(campaignDispatches)
    .innerJoin(campaigns, eq(campaignDispatches.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        eq(campaignDispatches.status, "sent"),
        sql`lower(${campaignDispatches.leadUsername}) = ${username}`,
      ),
    )
    .orderBy(desc(campaignDispatches.enviadoEm))
    .limit(1);

  if (!outbound?.mensagemRender?.trim()) return;

  await db.insert(agentMessages).values({
    userId,
    igsid,
    username,
    role: "assistant",
    content: outbound.mensagemRender.trim(),
  });
}

async function resolveIgUsername(igsid: string, accessToken: string) {
  try {
    const url = new URL(`https://graph.facebook.com/v22.0/${igsid}`);
    url.searchParams.set("fields", "username");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string };
    return data.username?.replace(/^@/, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

async function wasProspected(userId: string, username: string) {
  const [hit] = await db
    .select({ id: campaignDispatches.id })
    .from(campaignDispatches)
    .innerJoin(campaigns, eq(campaignDispatches.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        eq(campaignDispatches.status, "sent"),
        sql`lower(${campaignDispatches.leadUsername}) = ${username}`,
      ),
    )
    .limit(1);
  return Boolean(hit);
}

async function shouldSkipRapidReply(userId: string, username: string) {
  const [hit] = await db
    .select({
      enviadoEm: campaignDispatches.enviadoEm,
      ignorar: campaigns.ignorarRespRapida,
      segundos: campaigns.ignorarRespSegundos,
    })
    .from(campaignDispatches)
    .innerJoin(campaigns, eq(campaignDispatches.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        eq(campaignDispatches.status, "sent"),
        eq(campaigns.ignorarRespRapida, true),
        sql`lower(${campaignDispatches.leadUsername}) = ${username}`,
      ),
    )
    .orderBy(desc(campaignDispatches.enviadoEm))
    .limit(1);

  if (!hit?.enviadoEm || !hit.ignorar) return false;
  const windowSec = hit.segundos || 30;
  const elapsed = (Date.now() - hit.enviadoEm.getTime()) / 1000;
  return elapsed < windowSec;
}

async function sendIgMessage(opts: {
  igBusinessId: string;
  accessToken: string;
  recipientId: string;
  text: string;
}) {
  const url = `https://graph.facebook.com/v22.0/${opts.igBusinessId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      message: { text: opts.text },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta send HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}
