import { NextResponse } from "next/server";
import { db } from "@/db";
import { extractions } from "@/db/schema";
import { isUserActive } from "@/lib/account";
import { getSession } from "@/lib/session";

function normalizeUsername(raw: string) {
  return raw
    .trim()
    .replace(/^@/, "")
    .replace(/https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  if (!(await isUserActive(session.user.id))) {
    return NextResponse.json(
      { ok: false, erro: "Conta suspensa — contate o suporte." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    nome?: string;
    limite?: number | null;
    delayMinMs?: number | null;
    delayMaxMs?: number | null;
  };

  const username = normalizeUsername(body.username || "");
  if (!username || username.length < 2) {
    return NextResponse.json(
      { ok: false, erro: "Informe um @username válido" },
      { status: 400 },
    );
  }

  const nome = (body.nome || `@${username}`).trim().slice(0, 160);
  const limite =
    body.limite && body.limite > 0 ? Math.floor(body.limite) : null;
  const delayMinMs =
    body.delayMinMs && body.delayMinMs >= 400
      ? Math.floor(body.delayMinMs)
      : 700;
  const delayMaxMs =
    body.delayMaxMs && body.delayMaxMs > delayMinMs
      ? Math.floor(body.delayMaxMs)
      : 1600;

  const [row] = await db
    .insert(extractions)
    .values({
      userId: session.user.id,
      nome,
      perfilAlvoUsername: username.slice(0, 120),
      perfilAlvoPk: "0",
      status: "queued",
      capturados: 0,
      limite,
      delayMinMs,
      delayMaxMs,
    })
    .returning();

  return NextResponse.json({
    ok: true,
    extraction: {
      id: row.id,
      nome: row.nome,
      status: row.status,
      perfil_alvo_username: row.perfilAlvoUsername,
    },
    aviso:
      "Fila criada. O worker na VPS processa automaticamente quando a sessão IG está em Minha Conta.",
  });
}
