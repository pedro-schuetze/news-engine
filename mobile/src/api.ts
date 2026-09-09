/**
 * Cliente da API do Iris (o site na Vercel). Leituras são públicas; toda
 * escrita leva a chave no header x-iris-key (ver web/src/middleware.ts).
 */
import { getAccessKey, getBaseUrl } from "./store";

export interface TodayStory {
  id: string;
  title: string;
  section: string;
  section_label: string;
  rank: number;
  url: string;
  published_at: string | null;
  first_seen: string;
  is_new: boolean;
  rank_change: number | null;
  outlets: { name: string; domain: string }[];
}

export interface TodaySnapshot {
  id: string;
  fetched_at: string;
  stories: TodayStory[];
}

export interface PostListItem {
  story_id: string;
  run_file: string;
  vertical: string;
  title: string;
  status: "draft" | "approved" | "published" | "rejected";
  slide_count: number;
  images_done: boolean;
  has_content: boolean;
  cover_url: string | null;
  created_at: string;
}

export interface PoolCandidate {
  id: string;
  url: string;
  origin: string;
  source: string;
  credit: string;
  placement: "TOP" | "CENTER" | "BOTTOM";
  align: "left" | "center" | "right";
  score: number;
  width: number | null;
  height: number | null;
  focus_x: number | null;
  focus_y: number | null;
  generated_for_slide: number | null;
}

export interface StorySlide {
  slide_number: number;
  kind: "cover" | "body" | "final";
  headline: string;
  body: string;
  render_url: string;
}

export interface StoryDetail {
  story_id: string;
  run_file: string;
  run_id: string;
  vertical: string;
  sub_brand: string;
  title: string;
  status: "draft" | "approved" | "published";
  summary: string;
  headline: string;
  caption: string;
  hashtags: string[];
  page_count: number;
  slides: StorySlide[];
  pool: PoolCandidate[];
  selection: {
    slide_number: number;
    candidate_id: string | null;
    placement: "TOP" | "CENTER" | "BOTTOM";
    align: "left" | "center" | "right";
  }[];
}

async function request<T>(path: string, init?: RequestInit & { write?: boolean }): Promise<T> {
  const base = await getBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.write) headers["x-iris-key"] = await getAccessKey();
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const api = {
  today: () => request<TodaySnapshot>("/api/mobile/today"),
  posts: () => request<{ posts: PostListItem[] }>("/api/mobile/posts"),
  story: (runFile: string, storyId: string) =>
    request<StoryDetail>(
      `/api/mobile/story?run=${encodeURIComponent(runFile)}&id=${encodeURIComponent(storyId)}`,
    ),

  /** Cria o post a partir de uma pauta da capa (escreve o rascunho). */
  createFromNews: (snapshotId: string, storyId: string) =>
    request<{ ok: boolean; run_file: string; story_id: string }>("/api/news/drafts", {
      method: "POST",
      write: true,
      body: JSON.stringify({ snapshot_id: snapshotId, story_id: storyId }),
    }),

  /** Gera o pacote completo (slides + legenda) de um post em triagem. */
  generate: (storyId: string, runFile: string) =>
    request<{ ok: boolean }>(
      `/api/generate/${storyId}?run=${encodeURIComponent(runFile)}`,
      { method: "POST", write: true, body: "{}" },
    ),

  /** Busca fotos para o pool (banco + oficiais + stock). */
  fetchMedia: (storyId: string, runFile: string) =>
    request<{ ok: boolean; pool: number; new_candidates: number }>(
      `/api/media/${storyId}?run=${encodeURIComponent(runFile)}`,
      { method: "POST", write: true, body: "{}" },
    ),

  /** Salva as decisões de edição (foto/posição por slide) de uma vez. */
  apply: (
    storyId: string,
    runFile: string,
    changes: { slide_number: number; candidate_id?: string | null; placement?: string }[],
  ) =>
    request<{ ok: boolean; saved: number }>(
      `/api/media/${storyId}/apply?run=${encodeURIComponent(runFile)}`,
      { method: "POST", write: true, body: JSON.stringify({ changes }) },
    ),

  review: (storyId: string, runId: string, vertical: string, status: "APPROVED" | "PUBLISHED" | "REJECTED") =>
    request<{ ok: boolean }>("/api/reviews", {
      method: "POST",
      write: true,
      body: JSON.stringify({ story_id: storyId, run_id: runId, vertical, review_status: status }),
    }),
};

export async function absoluteUrl(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${await getBaseUrl()}${pathOrUrl}`;
}
