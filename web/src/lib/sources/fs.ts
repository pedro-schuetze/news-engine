/**
 * Fonte de dados: filesystem local (modo default, dev na máquina do Pedro).
 * Lê os mesmos JSONs que o pipeline Python escreve em ../data.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PipelineRun, Review, RunListItem } from "../types";
import { RUN_FILE_RE, STORY_ID_RE } from "./common";

// web/ é o cwd do Next; os dados do pipeline ficam na raiz do repo
const REPO_ROOT = path.resolve(process.cwd(), "..");
const DATA_DIR = process.env.NEWS_DATA_DIR
  ? path.resolve(process.env.NEWS_DATA_DIR)
  : path.join(REPO_ROOT, "data");
const RUNS_DIR = path.join(DATA_DIR, "runs");
const REVIEWS_DIR = path.join(DATA_DIR, "reviews");

// cache por (arquivo, mtime): runs são imutáveis depois de escritos, mas o
// latest.json muda — o mtime invalida sozinho
const runCache = new Map<string, { mtime: number; run: PipelineRun }>();

async function readRunPath(target: string): Promise<PipelineRun | null> {
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

export async function readRun(file?: string | null): Promise<PipelineRun | null> {
  if (!file || file === "latest") {
    return readRunPath(path.join(DATA_DIR, "latest.json"));
  }
  if (!RUN_FILE_RE.test(file)) return null; // bloqueia path traversal
  return readRunPath(path.join(RUNS_DIR, file));
}

export async function listReviews(): Promise<Record<string, Review>> {
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
  if (!STORY_ID_RE.test(review.story_id)) {
    throw new Error("story_id inválido");
  }
  await fs.mkdir(REVIEWS_DIR, { recursive: true });
  const target = path.join(REVIEWS_DIR, `${review.story_id}.json`);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(review, null, 2), "utf-8");
  await fs.rename(tmp, target);
}

/** Arquivo binário (imagem) relativo à raiz do repo, como data URL. */
export async function readMediaFile(relPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(REPO_ROOT, relPath));
    const ext = path.extname(relPath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Lê um arquivo de texto relativo à raiz do repo (ex.: config/verticals.yaml). */
export async function readTextFile(relPath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(REPO_ROOT, relPath), "utf-8");
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

export async function readEnvView(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const raw = await readTextFile(".env");
  if (!raw) return out;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if ((ENV_WHITELIST as readonly string[]).includes(key) && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}
