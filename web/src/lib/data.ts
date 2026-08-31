/**
 * Acesso a dados do dashboard — MVP: filesystem local (mesmos JSONs que o
 * pipeline Python escreve em ../data).
 *
 * Futuro (deploy na Vercel): trocar esta camada por uma fonte remota — os
 * JSONs já são commitados no GitHub pelo Actions (raw + token) ou, na fase
 * seguinte, Supabase. Só este arquivo precisa mudar (docs/CONTEXT.md).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { PipelineRun, Review, RunListItem, Story } from "./types";

// web/ é o cwd do Next; os dados do pipeline ficam na raiz do repo
const REPO_ROOT = path.resolve(process.cwd(), "..");
const DATA_DIR = process.env.NEWS_DATA_DIR
  ? path.resolve(process.env.NEWS_DATA_DIR)
  : path.join(REPO_ROOT, "data");
const RUNS_DIR = path.join(DATA_DIR, "runs");
const REVIEWS_DIR = path.join(DATA_DIR, "reviews");
const CONFIG_DIR = process.env.NEWS_CONFIG_DIR
  ? path.resolve(process.env.NEWS_CONFIG_DIR)
  : path.join(REPO_ROOT, "config");

const RUN_FILE_RE = /^[\w.-]+\.json$/;

// cache por (arquivo, mtime): runs são imutáveis depois de escritos, mas o
// latest.json muda — o mtime invalida sozinho
const runCache = new Map<string, { mtime: number; run: PipelineRun }>();

async function readRunFile(target: string): Promise<PipelineRun | null> {
  try {
    const stat = await fs.stat(target);
    const cached = runCache.get(target);
    if (cached && cached.mtime === stat.mtimeMs) return cached.run;
    const raw = await fs.readFile(target, "utf-8");
    const run = JSON.parse(raw) as PipelineRun;
    runCache.set(target, { mtime: stat.mtimeMs, run });
    return run;
  } catch {
    return null;
  }
}

export async function listRunFiles(limit = 30): Promise<RunListItem[]> {
  let files: string[] = [];
  try {
    files = await fs.readdir(RUNS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => RUN_FILE_RE.test(f) && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => ({ file: f, label: f.replace(".json", "").replace("_", " ") }));
}

export async function loadRun(file?: string | null): Promise<PipelineRun | null> {
  let target: string;
  if (!file || file === "latest") {
    target = path.join(DATA_DIR, "latest.json");
  } else {
    if (!RUN_FILE_RE.test(file)) return null; // bloqueia path traversal
    target = path.join(RUNS_DIR, file);
  }
  return readRunFile(target);
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
  const files = await listRunFiles(limit);
  const out: RunSummary[] = [];
  for (const f of files) {
    const run = await readRunFile(path.join(RUNS_DIR, f.file));
    if (!run) continue;
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
  }
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
  const files = await listRunFiles(limitRuns);
  const out: StoryEntry[] = [];
  for (const f of files) {
    const run = await readRunFile(path.join(RUNS_DIR, f.file));
    if (!run) continue;
    for (const vr of Object.values(run.verticals)) {
      for (const story of vr.stories) {
        out.push({
          story,
          runFile: f.file,
          runStartedAt: run.started_at,
          runMode: run.mode,
        });
      }
    }
  }
  return out;
}

export async function loadReviews(): Promise<Record<string, Review>> {
  const out: Record<string, Review> = {};
  let files: string[] = [];
  try {
    files = await fs.readdir(REVIEWS_DIR);
  } catch {
    return out;
  }
  await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(REVIEWS_DIR, f), "utf-8");
          const review = JSON.parse(raw) as Review;
          if (review.story_id) out[review.story_id] = review;
        } catch {
          /* review ilegível: ignora */
        }
      }),
  );
  return out;
}

export async function saveReview(review: Review): Promise<void> {
  if (!/^[\w-]+$/.test(review.story_id)) {
    throw new Error("story_id inválido");
  }
  await fs.mkdir(REVIEWS_DIR, { recursive: true });
  const target = path.join(REVIEWS_DIR, `${review.story_id}.json`);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(review, null, 2), "utf-8");
  await fs.rename(tmp, target);
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
  try {
    const raw = await fs.readFile(path.join(CONFIG_DIR, "verticals.yaml"), "utf-8");
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
  try {
    const raw = await fs.readFile(path.join(CONFIG_DIR, "sources.yaml"), "utf-8");
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
  try {
    const raw = await fs.readFile(path.join(CONFIG_DIR, "ranking.yaml"), "utf-8");
    return parseYaml(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Valores NÃO-sensíveis do .env da raiz para exibição em /config.
 * Whitelist estrita — chaves de API nunca são lidas para a UI.
 */
const ENV_WHITELIST = [
  "LLM_PROVIDER",
  "LLM_FALLBACK_PROVIDER",
  "ANTHROPIC_MODEL",
  "OPENAI_MODEL",
  "OPENAI_REASONING_EFFORT",
  "PIPELINE_MODE",
  "NEWS_LOOKBACK_HOURS",
  "MIN_STORIES_PER_VERTICAL",
  "MAX_STORIES_PER_VERTICAL",
  "TIMEZONE",
  "DATA_DIR",
] as const;

export async function loadEnvView(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, ".env"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if ((ENV_WHITELIST as readonly string[]).includes(key) && value.trim()) {
        out[key] = value.trim();
      }
    }
  } catch {
    /* sem .env: mostra só defaults */
  }
  return out;
}
