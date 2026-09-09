/**
 * Chave de acesso simples (decisão do Pedro, 2026-09-09, junto do app iOS):
 * toda rota de API que ESCREVE exige a chave — o site a envia via cookie
 * (página /entrar), o app iOS via header x-iris-key. Leituras continuam
 * públicas (o repo de dados já é público; o valor a proteger é a escrita:
 * aprovar, editar, gerar, publicar).
 *
 * Sem IRIS_APP_KEY configurada, nada é exigido (dev local e preview seguem
 * livres). O cron tem segredo próprio (CRON_SECRET) e fica fora daqui.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OPEN_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const OPEN_PATHS = [
  "/api/cron/", // autenticado por CRON_SECRET na própria rota
  "/api/auth", // é a porta de entrada — precisa aceitar a chave
];

export function middleware(request: NextRequest) {
  const key = (process.env.IRIS_APP_KEY ?? "").trim();
  if (!key) return NextResponse.next();
  if (OPEN_METHODS.has(request.method)) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const fromHeader = (request.headers.get("x-iris-key") ?? "").trim();
  const fromCookie = (request.cookies.get("iris_key")?.value ?? "").trim();
  if (fromHeader === key || fromCookie === key) return NextResponse.next();

  return NextResponse.json(
    { error: "acesso restrito — entre em /entrar (site) ou configure a chave no app" },
    { status: 401 },
  );
}

export const config = {
  matcher: "/api/:path*",
};
