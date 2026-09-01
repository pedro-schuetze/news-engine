/**
 * Fonte de dados: GitHub Contents API (produção na Vercel, sem filesystem).
 *
 * - Lê data/latest.json, data/runs/*, data/reviews/* e config/*.yaml direto
 *   do repositório (dados sempre frescos — o Actions commita os runs).
 * - Grava reviews como COMMITS no repo (PUT contents) — aprovar/rejeitar
 *   funciona em produção; o repositório continua sendo a fonte da verdade.
 * - Cache por ETag em memória do processo: respostas 304 não contam para o
 *   rate limit (5k req/h com token).
 *
 * Env vars (Vercel): NEWS_DATA_SOURCE=github, GITHUB_TOKEN (fine-grained,
 * só este repo, Contents read/write), NEWS_GITHUB_REPO, NEWS_GITHUB_BRANCH.
 */

import type { PipelineRun, Review, RunListItem } from "../types";
import { RUN_FILE_RE, STORY_ID_RE } from "./common";

const API = "https://api.github.com";
// trim em tudo: env vars podem chegar com "\r"/espaços (CLI no Windows)
const REPO = (process.env.NEWS_GITHUB_REPO ?? "pedro-schuetze/news-engine").trim();
const BRANCH = (process.env.NEWS_GITHUB_BRANCH ?? "main").trim();
const TOKEN = (process.env.GITHUB_TOKEN ?? "").trim();
// teto de runs lidos remotamente por página (cold start amigável)
const MAX_RUNS = Number.parseInt((process.env.NEWS_GITHUB_MAX_RUNS ?? "12").trim(), 10);

interface CacheEntry {
  etag: string;
  body: unknown;
}
const etagCache = new Map<string, CacheEntry>();

export let lastError: string | null = null;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "news-engine-dashboard",
    ...extra,
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

function contentsUrl(path: string): string {
  return `${API}/repos/${REPO}/contents/${path}`;
}

/** GET com cache por ETag. raw=true devolve o conteúdo do arquivo como texto. */
async function ghGet(path: string, raw: boolean): Promise<unknown | null> {
  const url = `${contentsUrl(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const key = `${raw ? "raw" : "json"}:${url}`;
  const cached = etagCache.get(key);
  const h = headers(raw ? { Accept: "application/vnd.github.raw+json" } : {});
  if (cached) h["If-None-Match"] = cached.etag;

  let res: Response;
  try {
    res = await fetch(url, { headers: h, cache: "no-store" });
  } catch (e) {
    lastError = `falha de rede ao acessar a API do GitHub: ${e}`;
    return null;
  }
  if (res.status === 304 && cached) return cached.body;
  if (res.status === 404) return null;
  if (!res.ok) {
    lastError =
      res.status === 401 || res.status === 403
        ? `GitHub API ${res.status} — confira o GITHUB_TOKEN (acesso de leitura/escrita a ${REPO})`
        : `GitHub API ${res.status} em ${path}`;
    return null;
  }
  lastError = null;
  const body = raw ? await res.text() : await res.json();
  const etag = res.headers.get("etag");
  if (etag) etagCache.set(key, { etag, body });
  return body;
}

function invalidate(path: string): void {
  const url = `${contentsUrl(path)}?ref=${encodeURIComponent(BRANCH)}`;
  etagCache.delete(`raw:${url}`);
  etagCache.delete(`json:${url}`);
}

interface DirEntry {
  name: string;
  type: string;
  sha: string;
}

async function listDir(path: string): Promise<DirEntry[]> {
  const body = await ghGet(path, false);
  return Array.isArray(body) ? (body as DirEntry[]) : [];
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const text = await ghGet(path, true);
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── interface da fonte ───────────────────────────────────────────────

export async function listRunFiles(limit = 30): Promise<RunListItem[]> {
  const entries = await listDir("data/runs");
  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".json") && RUN_FILE_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse()
    .slice(0, Math.min(limit, MAX_RUNS))
    .map((f) => ({ file: f, label: f.replace(".json", "").replace("_", " ") }));
}

export async function readRun(file?: string | null): Promise<PipelineRun | null> {
  if (!file || file === "latest") {
    return readJsonFile<PipelineRun>("data/latest.json");
  }
  if (!RUN_FILE_RE.test(file)) return null;
  return readJsonFile<PipelineRun>(`data/runs/${file}`);
}

export async function listReviews(): Promise<Record<string, Review>> {
  const entries = await listDir("data/reviews");
  const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
  const out: Record<string, Review> = {};
  await Promise.all(
    files.map(async (e) => {
      const review = await readJsonFile<Review>(`data/reviews/${e.name}`);
      if (review?.story_id) out[review.story_id] = review;
    }),
  );
  return out;
}

async function fileSha(path: string): Promise<string | null> {
  // metadado (inclui sha) sem cache — precisa estar fresco para o PUT
  const url = `${contentsUrl(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status} ao ler sha de ${path}`);
  const body = (await res.json()) as { sha?: string };
  return body.sha ?? null;
}

export async function saveReview(review: Review): Promise<void> {
  if (!STORY_ID_RE.test(review.story_id)) {
    throw new Error("story_id inválido");
  }
  if (!TOKEN) {
    throw new Error("GITHUB_TOKEN não configurado — reviews em produção gravam via API do GitHub");
  }
  const path = `data/reviews/${review.story_id}.json`;
  const content = Buffer.from(JSON.stringify(review, null, 2) + "\n", "utf-8").toString("base64");
  const message =
    `review: ${review.review_status} ${review.story_id.slice(0, 8)}` +
    (review.vertical ? ` (${review.vertical})` : "");

  // até 2 tentativas: corrida com o commit diário do Actions muda o sha
  let sha = await fileSha(path);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(contentsUrl(path), {
      method: "PUT",
      headers: headers(),
      cache: "no-store",
      body: JSON.stringify({ message, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) {
      invalidate(path);
      invalidate("data/reviews");
      return;
    }
    if ((res.status === 409 || res.status === 422) && attempt === 1) {
      sha = await fileSha(path);
      continue;
    }
    throw new Error(`GitHub API ${res.status} ao gravar review`);
  }
}

/** Arquivo binário (imagem) do repo, como data URL. Usa a API raw. */
export async function readMediaFile(relPath: string): Promise<string | null> {
  const url = `${contentsUrl(relPath)}?ref=${encodeURIComponent(BRANCH)}`;
  try {
    const res = await fetch(url, {
      headers: headers({ Accept: "application/vnd.github.raw" }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = relPath.toLowerCase().split(".").pop();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function readTextFile(relPath: string): Promise<string | null> {
  const text = await ghGet(relPath, true);
  return typeof text === "string" ? text : null;
}

export async function readEnvView(): Promise<Record<string, string>> {
  // o .env não existe (nem deve) em produção; /config mostra defaults
  return {};
}
