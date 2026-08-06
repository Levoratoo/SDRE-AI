import { NextResponse } from "next/server";
import { resolveUserFromBearer } from "@/lib/api-key";

export async function GET(req: Request) {
  const user = await resolveUserFromBearer(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json(
      { ok: false, erro: "API key inválida" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    usuario: {
      id: user.id,
      nome: user.nome,
      email: user.email,
    },
    // Compat com extensão Evolua (testPanel)
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
    },
    nome: user.nome,
    email: user.email,
    id: user.id,
    servidor: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ts: Math.floor(Date.now() / 1000),
  });
}
