/**
 * Conexão com o Instagram (API da Meta, "Instagram API with Instagram Login").
 *
 * Envs (Vercel + web/.env.local):
 *   IG_USER_ID        id numérico da conta profissional
 *   IG_ACCESS_TOKEN   token de longa duração (60 dias; renovar em Config)
 *
 * Três capacidades, todas atrás das envs (sem elas, tudo responde
 * "desconectado" e o app/site seguem no fluxo manual):
 *   - status: app/site descobrem se a publicação direta está disponível;
 *   - sync:   puxa as mídias publicadas + métricas e casa com os posts do
 *             sistema pela legenda (data/instagram.json, versionado);
 *   - publish: publica o carrossel direto (cria children → container → publish).
 */
import { dataSource, loadRun } from "./data";
import { findStory } from "./media/persist";
import { slideVersion } from "./slides/version";

const G = "https://graph.instagram.com/v23.0";
const TOKEN_PATH = "data/instagram_token.json";

export function igConfigured(): boolean {
  return Boolean(
    (process.env.IG_USER_ID ?? "").trim() && (process.env.IG_ACCESS_TOKEN ?? "").trim(),
  );
}

let tokenCache: { token: string; at: number } | null = null;

/** Token vigente: o arquivo renovado pelo cron vence a env (semente). */
async function currentToken(): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.at < 5 * 60_000) return tokenCache.token;
  const raw = await dataSource().readTextFile(TOKEN_PATH);
  let token = (process.env.IG_ACCESS_TOKEN ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { token?: string };
      if (parsed.token) token = parsed.token;
    } catch {
      /* arquivo corrompido: segue a env */
    }
  }
  tokenCache = { token, at: Date.now() };
  return token;
}

async function creds() {
  return {
    user: (process.env.IG_USER_ID ?? "").trim(),
    token: await currentToken(),
  };
}

/**
 * Renova o token de longa duração (60 dias; renovável após 24h de idade) e
 * grava em data/instagram_token.json. Chamada pelo cron diário — renovação
 * frequente é inofensiva e mantém a validade sempre perto do teto.
 */
export async function igRefreshToken(): Promise<{ ok: boolean; expires_days?: number; note?: string }> {
  const token = await currentToken();
  if (!token) return { ok: false, note: "sem token para renovar" };
  const res = await fetch(
    `${G.replace("/v23.0", "")}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !body.access_token) {
    // token com menos de 24h não renova — não é erro de verdade
    return { ok: false, note: body.error?.message?.slice(0, 160) ?? `HTTP ${res.status}` };
  }
  await dataSource().writeTextFile(
    TOKEN_PATH,
    JSON.stringify({ token: body.access_token, refreshed_at: new Date().toISOString() }, null, 2) + "\n",
    "instagram: token renovado",
  );
  tokenCache = { token: body.access_token, at: Date.now() };
  return { ok: true, expires_days: Math.round((body.expires_in ?? 0) / 86400) };
}

async function ig<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${G}${path}`, { ...init, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    throw new Error(`Instagram ${res.status}: ${body.error?.message ?? "erro"}`.slice(0, 200));
  }
  return body;
}

export interface IgMedia {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
}

/** Mídias recentes da conta, com métricas. */
export async function igRecentMedia(limit = 50): Promise<IgMedia[]> {
  const { user, token } = await creds();
  const fields = "id,caption,permalink,timestamp,media_type,like_count,comments_count";
  const data = await ig<{ data?: IgMedia[] }>(
    `/${user}/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(token)}`,
  );
  return data.data ?? [];
}

export interface IgSyncFile {
  synced_at: string;
  account: string;
  /** story_id -> mídia do Instagram correspondente */
  posts: Record<
    string,
    { media_id: string; permalink: string; timestamp: string; likes: number; comments: number }
  >;
}

const SYNC_PATH = "data/instagram.json";

export async function loadIgSync(): Promise<IgSyncFile | null> {
  const raw = await dataSource().readTextFile(SYNC_PATH);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IgSyncFile;
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

/**
 * Casa as mídias do Instagram com os posts do sistema pela LEGENDA (a
 * legenda é gerada aqui e colada lá — os primeiros ~70 caracteres
 * normalizados identificam o post com folga).
 */
export async function igSync(
  published: { story_id: string; caption: string }[],
): Promise<IgSyncFile> {
  const media = await igRecentMedia(50);
  const byCaption = media
    .filter((m) => m.caption)
    .map((m) => ({ key: norm(m.caption!), m }));

  const posts: IgSyncFile["posts"] = {};
  for (const p of published) {
    if (!p.caption) continue;
    const key = norm(p.caption);
    const hit = byCaption.find((c) => c.key === key || c.key.startsWith(key.slice(0, 50)));
    if (hit) {
      posts[p.story_id] = {
        media_id: hit.m.id,
        permalink: hit.m.permalink ?? "",
        timestamp: hit.m.timestamp ?? "",
        likes: hit.m.like_count ?? 0,
        comments: hit.m.comments_count ?? 0,
      };
    }
  }
  const file: IgSyncFile = {
    synced_at: new Date().toISOString(),
    account: (process.env.IG_USER_ID ?? "").trim(),
    posts,
  };
  await dataSource().writeTextFile(
    SYNC_PATH,
    JSON.stringify(file, null, 2) + "\n",
    "instagram: sync de publicados e métricas",
  );
  return file;
}

/**
 * Publica o carrossel direto na conta: 1 container por slide (image_url
 * público), container CAROUSEL com os filhos, media_publish. Devolve o
 * permalink. Leva ~10-30s (a Meta baixa e processa cada imagem).
 */
export async function igPublishCarousel(
  runFile: string,
  storyId: string,
  publicBaseUrl: string,
): Promise<{ media_id: string; permalink: string }> {
  const { user, token } = await creds();
  const run = await loadRun(runFile);
  const story = run ? findStory(run, storyId) : null;
  if (!run || !story?.draft?.slides?.length) throw new Error("post não encontrado");
  const covered = new Set((story.slide_media ?? []).map((m) => m.slide_number));
  const missing = story.draft.slides.filter((s) => !covered.has(s.slide_number));
  if (missing.length) throw new Error("post com slides sem imagem — complete antes de publicar");

  const caption = `${story.draft.caption}\n\n${(story.draft.hashtags ?? []).join(" ")}`.slice(0, 2200);

  // 1. containers dos slides
  const children: string[] = [];
  for (const s of story.draft.slides) {
    const url = `${publicBaseUrl}/api/slide/${storyId}/${s.slide_number}?run=${encodeURIComponent(runFile)}&v=${slideVersion(story, s.slide_number)}`;
    const c = await ig<{ id: string }>(`/${user}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: url,
        is_carousel_item: "true",
        access_token: token,
      }).toString(),
    });
    children.push(c.id);
  }

  // 2. container do carrossel
  const carousel = await ig<{ id: string }>(`/${user}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: token,
    }).toString(),
  });

  // 3. publicar
  const published = await ig<{ id: string }>(`/${user}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: carousel.id, access_token: token }).toString(),
  });

  const info = await ig<{ permalink?: string }>(
    `/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
  );
  return { media_id: published.id, permalink: info.permalink ?? "" };
}
