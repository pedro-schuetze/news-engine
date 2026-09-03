/**
 * Persistência de mídia do post: pool de candidatas + seleção por slide.
 *
 * Modelo (2026-09-02): toda imagem obtida (busca no banco ou upload do
 * ChatGPT) vira uma CANDIDATA em story.media_pool, com arquivo em
 * data/media/<story>/pool/<id>.<ext>. A seleção do editor (ou a pré-seleção
 * por score) vira story.slide_media — o único lugar que renderer, export e
 * Prontos conhecem. Trocar a imagem de um slide = apontar slide_media para
 * outra candidata; nenhum byte novo é gravado.
 *
 * dev (fs):  arquivos em ../data/media/... e JSONs do run no disco.
 * produção:  um único commit (Git Trees API) com arquivos + JSONs.
 */

import { DATA_MODE, findRunFile, loadRun } from "../data";
import type { MediaAsset, MediaCandidate, PipelineRun, Story } from "../types";

export interface PoolFile {
  candidate: MediaCandidate;
  bytes: Buffer;
}

// ── modelo ───────────────────────────────────────────────────────────

export function poolPath(storyId: string, id: string, mime: string): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `data/media/${storyId}/pool/${id}.${ext}`;
}

export function findStory(run: PipelineRun, storyId: string): Story | null {
  for (const vr of Object.values(run.verticals)) {
    for (const s of vr.stories) if (s.story_id === storyId) return s;
  }
  return null;
}

/** Candidata → asset de slide (o formato que o renderer consome). */
export function assetFromCandidate(
  storyId: string,
  slideNumber: number,
  c: MediaCandidate,
): MediaAsset {
  return {
    asset_id: `${storyId.slice(0, 8)}-s${slideNumber}`,
    story_id: storyId,
    slide_number: slideNumber,
    type: "image",
    local_path: c.local_path,
    remote_url: null,
    mime_type: c.mime_type,
    width: c.width ?? null,
    height: c.height ?? null,
    provenance: {
      source_type: c.origin === "upload" ? "GENERATED" : "LICENSED",
      source_name: c.source,
      license: c.origin === "upload" ? "gerada por IA para uso editorial próprio" : c.credit,
      attribution_required: true,
      attribution_text: c.credit,
    },
    text_placement: c.text_placement,
    text_align: c.text_align,
    prompt: "",
    estimated_cost_usd: null,
    focus_x: c.focus_x,
    focus_y: c.focus_y,
  };
}

/** Acrescenta candidatas ao pool da story (dedupe por id). */
export function applyPool(story: Story, candidates: MediaCandidate[]): MediaCandidate[] {
  const pool = story.media_pool ?? [];
  const known = new Set(pool.map((c) => c.id));
  const fresh = candidates.filter((c) => !known.has(c.id));
  story.media_pool = [...pool, ...fresh];
  return fresh;
}

/** Define a imagem de UM slide a partir de uma candidata do pool. */
export function applySelection(story: Story, slideNumber: number, c: MediaCandidate): void {
  const media = (story.slide_media ?? []).filter((m) => m.slide_number !== slideNumber);
  media.push(assetFromCandidate(story.story_id, slideNumber, c));
  media.sort((a, b) => a.slide_number - b.slide_number);
  story.slide_media = media;
}

/**
 * Pré-seleção: preenche APENAS slides sem imagem, melhor score primeiro,
 * sem repetir candidata dentro do post. Nunca mexe em escolha já feita.
 */
export function autoFillEmptySlides(story: Story): number[] {
  const slides = story.draft?.slides ?? [];
  const pool = story.media_pool ?? [];
  const usedPaths = new Set((story.slide_media ?? []).map((m) => m.local_path));
  const covered = new Set((story.slide_media ?? []).map((m) => m.slide_number));
  const free = pool
    .filter((c) => !usedPaths.has(c.local_path))
    .sort((a, b) => b.score - a.score);
  const filled: number[] = [];
  for (const slide of slides) {
    const n = slide.slide_number;
    if (covered.has(n)) continue;
    const next = free.shift();
    if (!next) break;
    applySelection(story, n, next);
    filled.push(n);
  }
  return filled;
}

// ── gravação (fs/github) ─────────────────────────────────────────────

async function runTargets(runId: string, runFile: string): Promise<string[]> {
  // BUG corrigido em 2026-09-02: escrever SEMPRE em latest.json fazia uma
  // edição num run do HISTÓRICO sobrescrever o latest com o run antigo (o
  // dashboard "hoje" passou a mostrar ontem). O latest só é alvo quando o
  // run editado É o latest.
  const targets: string[] = [];
  if (runFile === "latest") {
    targets.push("data/latest.json");
  } else {
    const latest = await loadRun("latest");
    if (latest?.run_id === runId) targets.push("data/latest.json");
  }
  const historyFile = runFile && runFile !== "latest" ? runFile : await findRunFile(runId);
  if (historyFile) targets.push(`data/runs/${historyFile}`);
  return targets;
}

async function writeFs(
  files: { rel: string; bytes: Buffer }[],
  run: PipelineRun,
  runFile: string,
): Promise<"fs"> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(process.cwd(), "..");
  for (const f of files) {
    const abs = path.join(repoRoot, f.rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.bytes);
  }
  const payload = JSON.stringify(run, null, 2);
  for (const rel of await runTargets(run.run_id, runFile)) {
    try {
      await fs.writeFile(path.join(repoRoot, rel), payload, "utf-8");
    } catch {
      /* arquivo do histórico pode não existir; latest é o que importa */
    }
  }
  return "fs";
}

const API = "https://api.github.com";
const REPO = (process.env.NEWS_GITHUB_REPO ?? "pedro-schuetze/news-engine").trim();
const BRANCH = (process.env.NEWS_GITHUB_BRANCH ?? "main").trim();

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${(process.env.GITHUB_TOKEN ?? "").trim()}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "news-engine-dashboard",
  };
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: ghHeaders(), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} em ${path}: ${(await res.text()).slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

async function writeGithub(
  files: { rel: string; bytes: Buffer }[],
  run: PipelineRun,
  runFile: string,
  message: string,
): Promise<"github"> {
  if (!(process.env.GITHUB_TOKEN ?? "").trim()) {
    throw new Error("GITHUB_TOKEN ausente: não é possível gravar mídia em produção");
  }
  const runJson = JSON.stringify(run, null, 2);
  const entries: { path: string; sha: string }[] = [];
  for (const f of files) {
    const blob = await gh<{ sha: string }>(`/repos/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: f.bytes.toString("base64"), encoding: "base64" }),
    });
    entries.push({ path: f.rel, sha: blob.sha });
  }
  for (const target of await runTargets(run.run_id, runFile)) {
    const blob = await gh<{ sha: string }>(`/repos/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({
        content: Buffer.from(runJson, "utf-8").toString("base64"),
        encoding: "base64",
      }),
    });
    entries.push({ path: target, sha: blob.sha });
  }
  const ref = await gh<{ object: { sha: string } }>(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh<{ tree: { sha: string } }>(`/repos/${REPO}/git/commits/${baseSha}`);
  const tree = await gh<{ sha: string }>(`/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: entries.map((f) => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha })),
    }),
  });
  const commit = await gh<{ sha: string }>(`/repos/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return "github";
}

/**
 * Grava candidatas novas (bytes + JSONs do run já mutado pelo chamador).
 * `poolFiles` pode ser vazio (ex.: seleção manual — só JSONs mudam).
 */
export async function persistMedia(
  poolFiles: PoolFile[],
  run: PipelineRun,
  runFile: string,
  message: string,
): Promise<"fs" | "github"> {
  const files = poolFiles.map((p) => ({ rel: p.candidate.local_path, bytes: p.bytes }));
  return DATA_MODE === "github"
    ? writeGithub(files, run, runFile, message)
    : writeFs(files, run, runFile);
}
