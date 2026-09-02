/**
 * Imagem dos slides — três camadas, nesta ordem:
 *
 *   1. BANCO com licença limpa (Wikimedia Commons → Openverse), mas SÓ quando
 *      a imagem é comprovadamente relevante: o título do arquivo precisa
 *      casar com uma entidade forte da story e não pode ser gráfico/mapa/logo.
 *      (Antes disso, buscas frouxas traziam gráfico de pizza e régua.)
 *   2. GERADA POR IA quando não há match confiável — ilustração editorial do
 *      TEMA, sem rosto de pessoa real (regra do projeto). Requer
 *      OPENAI_API_KEY com acesso a modelo de imagem.
 *   3. FUNDO GRÁFICO determinístico (render.tsx) se nada acima estiver
 *      disponível — o post nunca sai sem visual.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Key da OpenAI: env var (produção, Vercel) ou, no dev local, o .env da raiz
 * do repositório — a mesma fonte única que o pipeline Python usa, sem
 * duplicar credencial em web/.env.local.
 */
let cachedKey: string | null = null;
export function openaiKey(): string {
  if (cachedKey !== null) return cachedKey;
  // O .env da raiz vence a env var do processo: no Windows do Pedro existe uma
  // OPENAI_API_KEY antiga de outro projeto OpenAI que mascarava a key correta
  // (mesma precedência aplicada no pipeline Python, src/config.py).
  cachedKey = keyFromRootDotEnv() || (process.env.OPENAI_API_KEY ?? "").trim();
  return cachedKey;
}

function keyFromRootDotEnv(): string {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), "..", ".env"), "utf-8");
    const line = raw.split(/\r?\n/).find((l) => /^\s*OPENAI_API_KEY\s*=/.test(l));
    if (!line) return "";
    return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch {
    return ""; // produção (Vercel): não há .env, usa a env var
  }
}

export interface SourcedImage {
  url: string; // http(s) ou data: URL (IA)
  credit: string;
  source: "wikimedia" | "openverse" | "ai";
}

const FETCH_TIMEOUT_MS = 6000;
const AI_TIMEOUT_MS = 60_000;
const cache = new Map<string, SourcedImage[]>();

// tipos de arquivo que nunca servem como foto editorial
const BAD_TITLE = /(diagram|chart|graph|plot|map\b|logo|icon|coat of arms|flag of|seal of|svg|screenshot|table|infographic|scheme|schéma|blueprint|timeline|font|typeface)/i;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "news-engine/0.2 (+https://github.com/pedro-schuetze/news-engine)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** O campo Artist do Wikimedia às vezes vem com instruções/URLs — reduz ao nome. */
function cleanArtist(raw: string): string {
  let s = stripHtml(raw).replace(/https?:\/\/\S+/g, "").replace(/\(.*?\)/g, "").trim();
  if (s.includes(":")) s = s.split(":").pop()!.trim();
  return s.replace(/^[,;\s]+|[,;\s]+$/g, "").slice(0, 40);
}

export function normalizeToken(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Palavras que abrem manchete e NÃO identificam ninguém. Sem esta lista, uma
// entidade de uma palavra como "Estudo" casaria com qualquer arquivo.
const GENERIC_HEAD = new Set(
  `estudo estudos pesquisa pesquisas pesquisadores cientistas novo nova novos novas
   como veja entenda apos após governo justica justiça policia polícia ministro
   ministra presidente candidato deputado senador the this what why how new
   scientists study research researchers report reportagem video vídeo`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Entidades fortes do título: nomes próprios (inclusive compostos) e siglas.
 *
 * A primeira palavra ENTRA na análise: manchete costuma abrir com o nome da
 * pessoa ("Lionel Richie volta a..."), e ignorá-la fazia a entidade virar só
 * "Richie" — que casou com a foto de Richie McCaw num post do Lionel Richie
 * (bug visto em 2026-09-01). Entidades de uma palavra passam por GENERIC_HEAD.
 */
export function strongEntities(title: string): string[] {
  const tokens = title.match(/[\p{L}\d]+/gu) ?? [];
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const joined = run.join(" ");
    // uma palavra só: precisa ser distintiva
    if (run.length > 1 || !GENERIC_HEAD.has(normalizeToken(joined))) out.push(joined);
    run = [];
  };
  tokens.forEach((t) => {
    const isAcronym = t.length >= 2 && t === t.toUpperCase() && /\p{L}/u.test(t);
    const isProper = /^\p{Lu}/u.test(t) && t.length >= 3 && t !== t.toUpperCase();
    if (isAcronym) {
      flush();
      out.push(t);
      return;
    }
    if (isProper) {
      run.push(t);
    } else {
      flush();
    }
  });
  flush();
  // nomes compostos primeiro (mais específicos)
  return [...new Set(out)].sort((a, b) => b.length - a.length).slice(0, 6);
}

/**
 * A imagem só passa se o título dela casar com uma entidade forte da story.
 * Quando a story tem nome COMPOSTO ("Lionel Richie"), só o nome composto vale:
 * exigir apenas "Richie" trouxe a foto de outra pessoa no run de 2026-09-01.
 */
function isRelevant(imageTitle: string, entities: string[]): boolean {
  if (BAD_TITLE.test(imageTitle)) return false;
  const hay = normalizeToken(imageTitle);
  const compound = entities.filter((e) => e.includes(" "));
  const required = compound.length > 0 ? compound : entities;
  return required.some((e) => {
    const needle = normalizeToken(e);
    if (needle.length < 5) return false; // termo curto casa com qualquer coisa
    return hay.includes(needle);
  });
}

async function searchWikimedia(
  query: string,
  entities: string[],
  limit: number,
): Promise<SourcedImage[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
    `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit + 10}` +
    "&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=1080&format=json&origin=*";
  const data = (await fetchJson(url)) as {
    query?: { pages?: Record<string, {
      index?: number;
      title?: string;
      imageinfo?: { thumburl?: string; mime?: string; extmetadata?: Record<string, { value?: string }> }[];
    }> };
  } | null;
  const pages = Object.values(data?.query?.pages ?? {});
  pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

  const out: SourcedImage[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) continue;
    if (!/image\/(jpeg|png)/.test(info.mime ?? "")) continue;
    const fileTitle = (page.title ?? "").replace(/^File:/, "");
    if (!isRelevant(fileTitle, entities)) continue;
    const meta = info.extmetadata ?? {};
    out.push({
      url: info.thumburl,
      credit: [cleanArtist(meta.Artist?.value ?? ""), stripHtml(meta.LicenseShortName?.value ?? "").slice(0, 24), "Wikimedia"]
        .filter(Boolean)
        .join(" · "),
      source: "wikimedia",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchOpenverse(
  query: string,
  entities: string[],
  limit: number,
): Promise<SourcedImage[]> {
  const url =
    "https://api.openverse.org/v1/images/?" +
    `q=${encodeURIComponent(query)}&license_type=commercial&page_size=${limit + 8}&filter_dead=false`;
  const data = (await fetchJson(url)) as {
    results?: { url?: string; title?: string; creator?: string; license?: string; source?: string }[];
  } | null;
  const out: SourcedImage[] = [];
  for (const r of data?.results ?? []) {
    if (!r.url) continue;
    if (!isRelevant(r.title ?? "", entities)) continue;
    out.push({
      url: r.url,
      credit: [r.creator?.slice(0, 40), (r.license ?? "").toUpperCase(), r.source].filter(Boolean).join(" · "),
      source: "openverse",
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── orquestração ─────────────────────────────────────────────────────

/** Busca pública no banco (usada pela geração por slide). */
export async function searchBankImages(title: string, limit: number): Promise<SourcedImage[]> {
  return searchBanks(title, limit);
}

async function searchBanks(title: string, limit: number): Promise<SourcedImage[]> {
  const entities = strongEntities(title);
  if (entities.length === 0) return [];
  const key = `${title}::${limit}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // busca pelas entidades mais específicas primeiro
  let images: SourcedImage[] = [];
  for (const query of entities.slice(0, 3)) {
    images = await searchWikimedia(query, entities, limit);
    if (images.length > 0) break;
    images = await searchOpenverse(query, entities, limit);
    if (images.length > 0) break;
  }
  cache.set(key, images);
  return images;
}

/** Baixa a imagem e devolve data URL (satori não espera hosts lentos). */
export async function toDataUrl(imageUrl: string): Promise<string | null> {
  if (imageUrl.startsWith("data:")) return imageUrl;
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "news-engine/0.2 (+https://github.com/pedro-schuetze/news-engine)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
