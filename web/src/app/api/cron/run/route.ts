/**
 * Gatilho pontual do run diário: Vercel Cron → workflow_dispatch no Actions.
 *
 * POR QUE existe. O evento `schedule:` do GitHub Actions é best-effort. Em
 * 02/09/2026 o run das 09:00 UTC simplesmente não foi criado — sem erro, sem
 * fila, sem registro. Em outro projeto com o mesmo desenho o sintoma foi
 * medido por quatro meses: o run era CRIADO com 24 a 740 min de atraso
 * (piores nas segundas), enquanto o job em si sempre terminava em 12-16 min.
 * É prioridade de fila, não código. A saída lá foi a mesma daqui: um agendador
 * chamando a API, porque evento vindo da API entra na mesma fila de um `push`
 * e sobe em segundos.
 *
 * O executor NÃO muda de lugar: o pipeline continua no Actions, que é onde
 * existem Python, as dependências e a permissão de commitar em data/. Só o
 * gatilho sai do cron do GitHub e vai para o cron da Vercel (web/vercel.json).
 *
 * AUTENTICAÇÃO. A Vercel manda `Authorization: Bearer $CRON_SECRET` nas
 * chamadas de cron quando essa env var existe. Sem o segredo configurado a
 * rota responde 401 e não dispara nada: um endpoint aberto aqui gastaria
 * crédito de API e commitaria no repositório a cada visita de robô.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// trim em tudo: env vars criadas via CLI no Windows podem carregar "\r"
const REPO = (process.env.NEWS_GITHUB_REPO ?? "pedro-schuetze/news-engine").trim();
const BRANCH = (process.env.NEWS_GITHUB_BRANCH ?? "main").trim();
const WORKFLOW = (process.env.NEWS_CRON_WORKFLOW ?? "daily-news.yml").trim();

/**
 * Janela de coleta pedida ao pipeline. 26h, e não as 18h do default antigo:
 * com o run acontecendo 1x/dia, uma janela de 18h deixa um vão de 6h POR DIA.
 * O run das 09:00 UTC cobre desde as 15:00 do dia anterior, e o run anterior
 * parou às 09:00 — ninguém olha a faixa 09:00-15:00. 24h fecha o vão e as 2h
 * extras absorvem o jitter do agendador (no plano Hobby o cron dispara dentro
 * da hora, não no minuto). O custo é praticamente o mesmo: o clustering é
 * local e o número de chamadas ao LLM é limitado por config, não pelo volume
 * coletado (medido em 02/09: 24h → 1.783 artigos, 22 chamadas, US$ 0,069).
 */
const LOOKBACK = (process.env.NEWS_CRON_LOOKBACK_HOURS ?? "26").trim();

const TZ = "America/Sao_Paulo";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // a API do GitHub rejeita requisição sem User-Agent
    "User-Agent": "news-engine-cron",
  };
}

/** Data de hoje em São Paulo (YYYY-MM-DD): o dia editorial é o dia do Pedro. */
function todayInBrt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function brtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

/**
 * Já existe execução do workflow hoje que não fracassou?
 *
 * Pergunta ao Actions em vez de olhar data/runs/: é exato (a listagem de runs
 * do dashboard é limitada por NEWS_GITHUB_MAX_RUNS e os posts manuais ocupam
 * as primeiras posições da ordenação) e responde exatamente o que interessa
 * aqui — "o gatilho já rodou hoje?". Quem protege os DADOS de um segundo run
 * é o guard dentro do workflow, que enxerga o data/runs/ inteiro no checkout.
 *
 * Execução que terminou em failure não bloqueia: aí um novo disparo é retry,
 * que é o comportamento desejado.
 */
async function runToday(token: string): Promise<WorkflowRun | null> {
  const today = todayInBrt();
  // filtro `created` da API é em UTC: pedimos de ontem para cá (barato) e
  // fazemos o corte exato por data BRT no JS
  const url =
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs` +
    `?per_page=20&created=%3E%3D${today}`;
  const res = await fetch(url, { headers: ghHeaders(token), cache: "no-store" });
  if (!res.ok) return null; // não sabemos: deixa o guard do workflow decidir
  const body = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return (
    (body.workflow_runs ?? []).find(
      (r) => brtDate(r.created_at) === today && r.conclusion !== "failure",
    ) ?? null
  );
}

function authorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    const reason = process.env.CRON_SECRET
      ? "segredo do cron não confere"
      : "CRON_SECRET não configurada nas env vars da Vercel";
    return NextResponse.json({ error: reason }, { status: 401 });
  }

  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN não configurada — sem ela não há como disparar o workflow" },
      { status: 500 },
    );
  }

  // ?force=1 pula só a checagem daqui, não o guard do workflow. Serve para
  // testar o caminho inteiro (token, permissão, guard) sem gastar API.
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force) {
    const existing = await runToday(token);
    if (existing) {
      return NextResponse.json({
        skipped: true,
        reason: `já existe run de hoje (${existing.status}/${existing.conclusion ?? "em andamento"})`,
        run_url: existing.html_url,
      });
    }
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: BRANCH, inputs: { lookback_hours: LOOKBACK } }),
      cache: "no-store",
    },
  );

  // 204 = aceito. Os erros prováveis, nomeados para não virar caça ao tesouro:
  if (res.status !== 204) {
    const detalhe: Record<number, string> = {
      401: "GITHUB_TOKEN inválido ou expirado (é a falha mais provável deste desenho)",
      403: "o token não tem permissão Actions: read and write neste repositório",
      404: `repositório ou workflow não encontrado (${REPO} / ${WORKFLOW}), ou token sem acesso`,
      422: `branch inválido (${BRANCH}) ou input recusado pelo workflow`,
    };
    return NextResponse.json(
      {
        error: detalhe[res.status] ?? `GitHub respondeu ${res.status}`,
        github_status: res.status,
        github_body: (await res.text()).slice(0, 300),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    dispatched: true,
    workflow: WORKFLOW,
    ref: BRANCH,
    lookback_hours: LOOKBACK,
    forced: force,
    at: new Date().toISOString(),
  });
}
