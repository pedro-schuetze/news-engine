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
import type { PipelineRun, Review, RunListItem } from "./types";

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
  try {
    const raw = await fs.readFile(target, "utf-8");
    return JSON.parse(raw) as PipelineRun;
  } catch {
    return null;
  }
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

/** display_name por vertical, lido de config/verticals.yaml (fallback: id). */
export async function loadVerticalNames(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(CONFIG_DIR, "verticals.yaml"), "utf-8");
    const parsed = parseYaml(raw) as {
      verticals?: { id?: string; display_name?: string }[];
    };
    const out: Record<string, string> = {};
    for (const v of parsed.verticals ?? []) {
      if (v.id) out[v.id] = v.display_name ?? v.id;
    }
    return out;
  } catch {
    return {};
  }
}
