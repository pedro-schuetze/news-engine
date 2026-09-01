/**
 * Persistência das imagens geradas sob demanda.
 *
 * dev (fs):     escreve em ../data/media/<story>/slide_N.jpg e atualiza o JSON
 *               do run no disco.
 * produção:     um único commit no repositório (Git Trees API) com as imagens
 *               e o JSON atualizado — 5 PUTs separados gerariam 5 commits.
 */

import { DATA_MODE } from "../data";
import type { MediaAsset, PipelineRun } from "../types";
import type { GeneratedAsset } from "./generate";

export interface PersistResult {
  assets: MediaAsset[];
  where: "fs" | "github";
}

function assetFor(
  storyId: string,
  draftId: string | null,
  gen: GeneratedAsset,
  relPath: string,
): MediaAsset {
  return {
    asset_id: `${storyId.slice(0, 8)}-s${gen.slide_number}`,
    story_id: storyId,
    slide_number: gen.slide_number,
    type: "image",
    local_path: relPath,
    remote_url: null,
    mime_type: gen.mime_type,
    width: null,
    height: null,
    provenance: {
      source_type: gen.source === "ai" ? "GENERATED" : "LICENSED",
      source_name: gen.source,
      license: gen.source === "ai" ? "gerada por IA para uso editorial próprio" : gen.credit,
      attribution_required: true,
      attribution_text: gen.credit,
    },
    text_placement: gen.text_placement,
    text_align: gen.text_align,
    prompt: gen.prompt,
    estimated_cost_usd: gen.estimated_cost_usd,
  };
}

function relPathFor(storyId: string, gen: GeneratedAsset): string {
  const ext = gen.mime_type === "image/png" ? "png" : "jpg";
  return `data/media/${storyId}/slide_${gen.slide_number}.${ext}`;
}

/** Atualiza a story dentro do run com os assets novos. */
export function applyAssets(run: PipelineRun, storyId: string, assets: MediaAsset[]): boolean {
  for (const vr of Object.values(run.verticals)) {
    for (const story of vr.stories) {
      if (story.story_id === storyId) {
        story.slide_media = assets;
        return true;
      }
    }
  }
  return false;
}

// ── filesystem (dev) ─────────────────────────────────────────────────

async function persistFs(
  storyId: string,
  draftId: string | null,
  generated: GeneratedAsset[],
  run: PipelineRun,
  runFile: string,
): Promise<PersistResult> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(process.cwd(), "..");

  const assets: MediaAsset[] = [];
  for (const gen of generated) {
    const rel = relPathFor(storyId, gen);
    const abs = path.join(repoRoot, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, gen.bytes);
    assets.push(assetFor(storyId, draftId, gen, rel));
  }

  applyAssets(run, storyId, assets);
  const payload = JSON.stringify(run, null, 2);
  const targets = [path.join(repoRoot, "data", "latest.json")];
  if (runFile && runFile !== "latest") {
    targets.push(path.join(repoRoot, "data", "runs", runFile));
  }
  for (const t of targets) {
    try {
      await fs.writeFile(t, payload, "utf-8");
    } catch {
      /* arquivo do histórico pode não existir; latest é o que importa */
    }
  }
  return { assets, where: "fs" };
}

// ── GitHub (produção): commit único via Trees API ─────────────────────

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
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: ghHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} em ${path}: ${(await res.text()).slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

async function persistGithub(
  storyId: string,
  draftId: string | null,
  generated: GeneratedAsset[],
  run: PipelineRun,
  runFile: string,
): Promise<PersistResult> {
  if (!(process.env.GITHUB_TOKEN ?? "").trim()) {
    throw new Error("GITHUB_TOKEN ausente: não é possível gravar as imagens em produção");
  }

  const assets = generated.map((gen) => assetFor(storyId, draftId, gen, relPathFor(storyId, gen)));
  applyAssets(run, storyId, assets);
  const runJson = JSON.stringify(run, null, 2);

  // 1) blobs das imagens + JSONs
  const files: { path: string; sha: string }[] = [];
  for (const [i, gen] of generated.entries()) {
    const blob = await gh<{ sha: string }>(`/repos/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: gen.bytes.toString("base64"), encoding: "base64" }),
    });
    files.push({ path: assets[i].local_path, sha: blob.sha });
  }
  for (const target of ["data/latest.json", ...(runFile && runFile !== "latest" ? [`data/runs/${runFile}`] : [])]) {
    const blob = await gh<{ sha: string }>(`/repos/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: Buffer.from(runJson, "utf-8").toString("base64"), encoding: "base64" }),
    });
    files.push({ path: target, sha: blob.sha });
  }

  // 2) árvore sobre o commit atual, 3) commit, 4) move a branch
  const ref = await gh<{ object: { sha: string } }>(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh<{ tree: { sha: string } }>(`/repos/${REPO}/git/commits/${baseSha}`);
  const tree = await gh<{ sha: string }>(`/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha })),
    }),
  });
  const commit = await gh<{ sha: string }>(`/repos/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `media: ${generated.length} imagens para ${storyId.slice(0, 8)}`,
      tree: tree.sha,
      parents: [baseSha],
    }),
  });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return { assets, where: "github" };
}

export async function persistAssets(
  storyId: string,
  draftId: string | null,
  generated: GeneratedAsset[],
  run: PipelineRun,
  runFile: string,
): Promise<PersistResult> {
  return DATA_MODE === "github"
    ? persistGithub(storyId, draftId, generated, run, runFile)
    : persistFs(storyId, draftId, generated, run, runFile);
}
