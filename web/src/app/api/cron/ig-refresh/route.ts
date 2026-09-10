/**
 * GET /api/cron/ig-refresh — cron diário da Vercel: renova o token de longa
 * duração do Instagram (60 dias, renovável após 24h) e grava o vigente em
 * data/instagram_token.json. Renovar todo dia mantém a validade no teto —
 * o Pedro nunca precisa pensar nisso. Autenticado pelo CRON_SECRET (a
 * Vercel envia o header automaticamente).
 */
import { NextResponse } from "next/server";
import { igConfigured, igRefreshToken } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const auth = request.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!igConfigured()) {
    return NextResponse.json({ ok: true, note: "Instagram não conectado — nada a renovar" });
  }
  const result = await igRefreshToken();
  return NextResponse.json(result);
}
