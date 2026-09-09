/**
 * POST /api/auth { key } — valida a chave de acesso e grava o cookie que o
 * middleware aceita. DELETE remove (sair). Ver web/src/middleware.ts.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const YEAR = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  const expected = (process.env.IRIS_APP_KEY ?? "").trim();
  if (!expected) {
    return NextResponse.json({ ok: true, note: "sem chave configurada — acesso livre" });
  }
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  if ((body.key ?? "").trim() !== expected) {
    return NextResponse.json({ error: "chave incorreta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("iris_key", expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: YEAR,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("iris_key", "", { maxAge: 0, path: "/" });
  return res;
}
