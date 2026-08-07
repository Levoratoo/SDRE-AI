import { and, count, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agentSettings,
  campaigns,
  extractions,
  igSessions,
  user,
} from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const userId = session.user.id;

  const [u] = await db
    .select({
      onboardingDismissed: user.onboardingDismissed,
      accountStatus: user.accountStatus,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const [ig] = await db
    .select({ id: igSessions.id })
    .from(igSessions)
    .where(eq(igSessions.userId, userId))
    .limit(1);

  const [extr] = await db
    .select({ value: count() })
    .from(extractions)
    .where(eq(extractions.userId, userId));

  const [camp] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.userId, userId),
        inArray(campaigns.status, ["running", "finished", "paused"]),
      ),
    );

  const [agent] = await db
    .select({
      hasToken: agentSettings.metaAccessToken,
      igId: agentSettings.metaIgBusinessId,
    })
    .from(agentSettings)
    .where(eq(agentSettings.userId, userId))
    .limit(1);

  const steps = [
    {
      id: "login",
      label: "Entrar no painel",
      done: true,
      href: null as string | null,
      optional: false,
    },
    {
      id: "ig_session",
      label: "Colar sessão do Instagram em Minha Conta",
      done: Boolean(ig),
      href: "/conta",
      optional: false,
    },
    {
      id: "extraction",
      label: "Enfileirar uma extração (@)",
      done: Number(extr?.value ?? 0) > 0,
      href: "/extracoes",
      optional: false,
    },
    {
      id: "campaign",
      label: "Criar campanha e dar Play",
      done: Number(camp?.value ?? 0) > 0,
      href: "/campanhas",
      optional: false,
    },
    {
      id: "agent",
      label: "Configurar Agente IA (Meta + webhook)",
      done: Boolean(agent?.hasToken && agent?.igId),
      href: "/agente",
      optional: true,
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const completedRequired = required.filter((s) => s.done).length;

  return NextResponse.json({
    ok: true,
    dismissed: u?.onboardingDismissed ?? false,
    accountStatus: u?.accountStatus ?? "active",
    steps,
    completedRequired,
    totalRequired: required.length,
    allRequiredDone: completedRequired >= required.length,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "dismiss") {
    return NextResponse.json({ ok: false, erro: "Ação inválida" }, { status: 400 });
  }

  await db
    .update(user)
    .set({ onboardingDismissed: true, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));

  return NextResponse.json({ ok: true });
}
