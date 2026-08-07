import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    nome?: string;
    senhaAtual?: string;
    senhaNova?: string;
  };

  if (typeof body.nome === "string") {
    const nome = body.nome.trim().slice(0, 80);
    if (nome.length < 2) {
      return NextResponse.json({ ok: false, erro: "Nome inválido" }, { status: 400 });
    }
    await db.update(user).set({ name: nome }).where(eq(user.id, session.user.id));
  }

  if (body.senhaNova) {
    if (!body.senhaAtual) {
      return NextResponse.json({ ok: false, erro: "Informe a senha atual" }, { status: 400 });
    }
    if (body.senhaNova.length < 8) {
      return NextResponse.json(
        { ok: false, erro: "Nova senha: mínimo 8 caracteres" },
        { status: 400 },
      );
    }

    const [acc] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "credential"),
        ),
      )
      .limit(1);

    if (!acc?.password) {
      return NextResponse.json(
        { ok: false, erro: "Conta sem senha local" },
        { status: 400 },
      );
    }

    const ok = await verifyPassword({
      hash: acc.password,
      password: body.senhaAtual,
    });
    if (!ok) {
      return NextResponse.json({ ok: false, erro: "Senha atual incorreta" }, { status: 400 });
    }

    const hashed = await hashPassword(body.senhaNova);
    await db
      .update(account)
      .set({ password: hashed })
      .where(eq(account.id, acc.id));
  }

  return NextResponse.json({ ok: true });
}
