import { NextResponse } from "next/server";
import { resolveUserFromBearer } from "@/lib/api-key";

export type ApiUser = {
  id: string;
  nome: string;
  email: string;
};

export async function requireApiUser(req: Request): Promise<
  | { user: ApiUser; error?: undefined }
  | { user?: undefined; error: NextResponse }
> {
  const user = await resolveUserFromBearer(req.headers.get("authorization"));
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, erro: "API key inválida" },
        { status: 401 },
      ),
    };
  }
  return { user };
}

export function jsonOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function jsonErro(erro: string, status = 400) {
  return NextResponse.json({ ok: false, erro }, { status });
}

export async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
