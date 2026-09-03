/**
 * Camada de dados do dashboard — fachada sobre duas fontes intercambiáveis:
 *
 *   NEWS_DATA_SOURCE=fs      (default) filesystem local (../data), uso na máquina
 *   NEWS_DATA_SOURCE=github  produção (Vercel): lê runs/reviews/config via
 *                            GitHub Contents API e grava reviews como commits
 *
 * As páginas só conhecem esta fachada. Fase 2 (Supabase) = mais uma fonte aqui.
 */

import { parse as parseYaml } from "yaml";
import * as fsSource from "./sources/fs";
import * as ghSource from "./sources/github";
import type { PipelineRun, Review, RunListItem, Story } from "./types";

// trim: valores de env criados via CLI no Windows podem carregar "\r"
// Decisão 2026-09-03 (Pedro): estado (runs/reviews/learned) fica no GitHub —
// versionado e auditável, "como um projeto normal". O Cloudflare R2 guarda
// APENAS mídia e renders (ver media/storage.ts). Um modo "estado no R2"
// chegou a ser implementado e foi revertido: com o commit rodando após a
// resposta (after) ele não ganhava latência que justificasse perder o git.
export const DATA_MODE: "fs" | "github" =
  (process.env.NEWS_DATA_SOURCE ?? "fs").trim().toLowerCase() === "github" ? "github" : "fs";

const src = DATA_MODE === "github" ? ghSource : fsSource;

/** fonte ativa — para quem grava fora desta fachada (persistRun etc.) */
export function dataSource() {
  return src;
}

/** Dica de diagnóstico para estados vazios (ex.: token faltando em produção). */
export function dataHint(): string | null {
  if (DATA_MODE !== "github") return null;
  if (ghSource.lastError) return ghSource.lastError;
  if (!process.env.GITHUB_TOKEN) {
    return "NEWS_DATA_SOURCE=github sem GITHUB_TOKEN — configure o token nas env vars da Vercel.";
  }
  return null;
}

// ── runs ─────────────────────────────────────────────────────────────

export async function listRunFiles(limit = 30): Promise<RunListItem[]> {
  return src.listRunFiles(limit);
}

export async function loadRun(file?: string | null): Promise<PipelineRun | null> {
  return src.readRun(file);
}

/**
 * Nome do arquivo em data/runs/ que corresponde a um run_id.
 *
 * Necessário porque o dashboard costuma abrir o run como "latest": gravar só
 * o latest.json deixava data/runs/ sem as imagens, e as páginas Prontos e
 * Histórico (que leem os arquivos de run) mostravam post sem imagem.
 */
export async function findRunFile(runId: string): Promise<string | null> {
  const files = await src.listRunFiles(30);
  for (const f of files) {
    const run = await src.readRun(f.file);
    if (run?.run_id === runId) return f.file;
  }
  return null;
}

export interface RunSummary {
  file: string;
  run_id: string;
  mode: string;
  started_at: string;
  duration_seconds: number;
  articles_collected: number;
  stories_selected: number;
  estimated_llm_cost_usd: number | null;
  errors: number;
  byVertical: Record<string, number>;
}

export async function listRunSummaries(limit = 30): Promise<RunSummary[]> {
  const files = await src.listRunFiles(limit);
  const runs = await Promise.all(files.map((f) => src.readRun(f.file)));
  const out: RunSummary[] = [];
  files.forEach((f, i) => {
    const run = runs[i];
    if (!run) return;
    out.push({
      file: f.file,
      run_id: run.run_id,
      mode: run.mode,
      started_at: run.started_at,
      duration_seconds: run.stats.duration_seconds,
      articles_collected: run.stats.articles_collected,
      stories_selected: run.stats.stories_selected,
      estimated_llm_cost_usd: run.stats.estimated_llm_cost_usd,
      errors: run.stats.errors.length,
      byVertical: Object.fromEntries(
        Object.entries(run.verticals).map(([vid, vr]) => [vid, vr.stories.length]),
      ),
    });
  });
  return out;
}

export interface StoryEntry {
  story: Story;
  runFile: string;
  runStartedAt: string;
  runMode: string;
}

/** Banco de stories: todas as selecionadas dos últimos runs, mais novas primeiro. */
export async function loadAllStories(limitRuns = 30): Promise<StoryEntry[]> {
  const files = await src.listRunFiles(limitRuns);
  const runs = await Promise.all(files.map((f) => src.readRun(f.file)));
  const out: StoryEntry[] = [];
  files.forEach((f, i) => {
    const run = runs[i];
    if (!run) return;
    for (const vr of Object.values(run.verticals)) {
      for (const story of vr.stories) {
        out.push({ story, runFile: f.file, runStartedAt: run.started_at, runMode: run.mode });
      }
    }
  });
  return out;
}

// ── reviews ──────────────────────────────────────────────────────────

export async function loadReviews(): Promise<Record<string, Review>> {
  return src.listReviews();
}

export async function saveReview(review: Review): Promise<void> {
  return src.saveReview(review);
}

// ── configuração (somente leitura) ───────────────────────────────────

export interface VerticalConfigView {
  id: string;
  display_name: string;
  description: string;
  tone: string;
  google_news_queries: { query: string; hl: string; gl: string }[];
  gdelt_queries: { query: string; sourcelang?: string; sourcecountry?: string }[];
  editorial_criteria: { name: string; description: string }[];
  guidance: { value?: string[]; avoid?: string[] };
  official_domains: string[];
  extra_rules: string[];
}

export async function loadVerticalConfigs(): Promise<VerticalConfigView[]> {
  const raw = await src.readTextFile("config/verticals.yaml");
  if (!raw) return [];
  try {
    const parsed = parseYaml(raw) as { verticals?: Partial<VerticalConfigView>[] };
    return (parsed.verticals ?? []).map((v) => ({
      id: v.id ?? "",
      display_name: v.display_name ?? v.id ?? "",
      description: v.description ?? "",
      tone: v.tone ?? "",
      google_news_queries: v.google_news_queries ?? [],
      gdelt_queries: v.gdelt_queries ?? [],
      editorial_criteria: v.editorial_criteria ?? [],
      guidance: v.guidance ?? {},
      official_domains: v.official_domains ?? [],
      extra_rules: v.extra_rules ?? [],
    }));
  } catch {
    return [];
  }
}

export async function loadVerticalNames(): Promise<Record<string, string>> {
  const configs = await loadVerticalConfigs();
  return Object.fromEntries(configs.map((v) => [v.id, v.display_name]));
}

export interface SourceView {
  source_name: string;
  url: string;
  domain: string;
  category: string;
  authority_score: number;
  language: string;
  enabled: boolean;
}

export async function loadSourceConfigs(): Promise<SourceView[]> {
  const raw = await src.readTextFile("config/sources.yaml");
  if (!raw) return [];
  try {
    const parsed = parseYaml(raw) as { sources?: Partial<SourceView>[] };
    return (parsed.sources ?? []).map((s) => ({
      source_name: s.source_name ?? "",
      url: s.url ?? "",
      domain: s.domain ?? "",
      category: s.category ?? "general",
      authority_score: s.authority_score ?? 50,
      language: s.language ?? "",
      enabled: s.enabled ?? true,
    }));
  } catch {
    return [];
  }
}

export async function loadRankingConfig(): Promise<Record<string, unknown> | null> {
  const raw = await src.readTextFile("config/ranking.yaml");
  if (!raw) return null;
  try {
    return parseYaml(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Imagem de mídia (data/media/...), como data URL. Com R2 configurado, a
 * leitura vem do bucket (CDN) — o repo deixa de servir binário. Fallback
 * para a fonte antiga cobre arquivos ainda não migrados. */
export async function loadMedia(relPath: string): Promise<string | null> {
  const { r2Enabled, r2Get } = await import("./media/storage");
  if (r2Enabled()) {
    const bytes = await r2Get(relPath);
    if (bytes) {
      const ext = relPath.toLowerCase().split(".").pop();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }
  }
  return src.readMediaFile(relPath);
}

/** Regra editorial compartilhada com o pipeline (prompts/<name>.md). */
export async function readPromptRule(name: string): Promise<string> {
  if (!/^[a-z_]+$/.test(name)) return "";
  return (await src.readTextFile(`prompts/${name}.md`))?.trim() ?? "";
}

/**
 * Direcionamentos que o Pedro marcou como "aprender para os próximos posts".
 * Chave "all" vale para todas as verticais; as outras são por vertical.
 */
export type LearnedDirectives = Record<string, string[]>;

export async function loadLearnedDirectives(): Promise<LearnedDirectives> {
  const raw = await src.readTextFile("data/learned.json");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as LearnedDirectives;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function addLearnedDirective(scope: string, directive: string): Promise<void> {
  const current = await loadLearnedDirectives();
  const key = scope || "all";
  const list = current[key] ?? [];
  if (!list.includes(directive)) list.push(directive);
  current[key] = list.slice(-12); // mantém os mais recentes
  await src.writeTextFile(
    "data/learned.json",
    JSON.stringify(current, null, 2) + "\n",
    `learn: direcionamento em ${key}`,
  );
}

export async function loadEnvView(): Promise<Record<string, string>> {
  return src.readEnvView();
}
