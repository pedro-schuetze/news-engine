/**
 * Sourcing de imagens com licença limpa e provenance — sem API key.
 *
 * Ordem: Wikimedia Commons (ótimo para pessoas públicas/instituições BR,
 * licenças CC com atribuição) → Openverse (agregador CC multi-fonte).
 * Toda imagem retorna com crédito+licença para imprimir no slide.
 *
 * Fase seguinte (com keys do Pedro): Unsplash/Pexels para conceitos e
 * geração por IA para ilustração — nunca pessoa real (regra do projeto).
 */

export interface SourcedImage {
  url: string; // URL da imagem (thumb grande)
  credit: string; // ex.: "Agência Senado · CC BY 2.0 · Wikimedia"
  source: "wikimedia" | "openverse";
}

const FETCH_TIMEOUT_MS = 6000;
const cache = new Map<string, SourcedImage[]>();

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
  let s = stripHtml(raw)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  // "When reusing, please credit me as author: Fulano, ..." -> pega após o último ":"
  if (s.includes(":")) s = s.split(":").pop()!.trim();
  s = s.replace(/^[,;\s]+|[,;\s]+$/g, "");
  return s.slice(0, 40);
}

async function searchWikimedia(query: string, limit: number): Promise<SourcedImage[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
    `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit + 4}` +
    "&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=1400&format=json&origin=*";
  const data = (await fetchJson(url)) as {
    query?: { pages?: Record<string, {
      index?: number;
      imageinfo?: {
        thumburl?: string;
        mime?: string;
        extmetadata?: Record<string, { value?: string }>;
      }[];
    }> };
  } | null;
  const pages = Object.values(data?.query?.pages ?? {});
  pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const out: SourcedImage[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) continue;
    if (!/image\/(jpeg|png)/.test(info.mime ?? "")) continue;
    const meta = info.extmetadata ?? {};
    const artist = cleanArtist(meta.Artist?.value ?? "");
    const license = stripHtml(meta.LicenseShortName?.value ?? "").slice(0, 30);
    out.push({
      url: info.thumburl,
      credit: [artist, license, "Wikimedia"].filter(Boolean).join(" · "),
      source: "wikimedia",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchOpenverse(query: string, limit: number): Promise<SourcedImage[]> {
  const url =
    "https://api.openverse.org/v1/images/?" +
    `q=${encodeURIComponent(query)}&license_type=commercial&page_size=${limit}` +
    "&filter_dead=false";
  const data = (await fetchJson(url)) as {
    results?: { url?: string; creator?: string; license?: string; source?: string }[];
  } | null;
  return (data?.results ?? [])
    .filter((r) => r.url)
    .slice(0, limit)
    .map((r) => ({
      url: r.url!,
      credit: [r.creator?.slice(0, 50), (r.license ?? "").toUpperCase(), r.source]
        .filter(Boolean)
        .join(" · "),
      source: "openverse" as const,
    }));
}

/** Busca imagens limpas para um assunto; nunca lança — [] em falha. */
export async function findImages(query: string, limit = 5): Promise<SourcedImage[]> {
  const key = `${query}::${limit}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let images = await searchWikimedia(query, limit);
  if (images.length === 0) {
    images = await searchOpenverse(query, limit);
  }
  cache.set(key, images);
  return images;
}

/** Baixa a imagem e devolve data URL (controle de timeout; satori não espera hosts lentos). */
export async function toDataUrl(imageUrl: string): Promise<string | null> {
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
    if (buf.length > 8_000_000) return null; // sanidade
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// foto de contexto quando nada específico existe (o post é SEMPRE visual)
const VERTICAL_FALLBACK_QUERY: Record<string, string> = {
  politics: "Congresso Nacional Brasília",
  entertainment: "concert stage crowd",
  facts: "science laboratory research",
};

/** Cascata de queries: específica → nome próprio → contexto da vertical. */
export function imageQueries(title: string, vertical: string): string[] {
  const tokens = title.match(/[\p{L}\d]+/gu) ?? [];
  const entities: string[] = [];
  let personName = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const isAcronym = t.length >= 2 && t === t.toUpperCase() && /\p{L}/u.test(t);
    const isProper = i > 0 && /^\p{Lu}/u.test(t) && t.length >= 3 && t !== t.toUpperCase();
    if ((isAcronym || isProper) && !entities.includes(t)) entities.push(t);
    // primeiro par adjacente de nomes próprios ≈ nome de pessoa/obra
    if (!personName && isProper && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      if (/^\p{Lu}/u.test(next) && next.length >= 3 && next !== next.toUpperCase()) {
        personName = `${t} ${next}`;
      }
    }
  }
  const queries: string[] = [];
  const full = entities.slice(0, 4).join(" ");
  if (full) queries.push(full);
  if (personName && personName !== full) queries.push(personName);
  const acronym = entities.find((e) => e === e.toUpperCase() && e.length >= 2);
  if (acronym && !queries.includes(acronym)) queries.push(acronym);
  queries.push(VERTICAL_FALLBACK_QUERY[vertical] ?? title.split(/\s+/).slice(0, 4).join(" "));
  return queries;
}

/** Tenta a cascata de queries até achar imagens. Nunca lança. */
export async function findImagesCascade(
  title: string,
  vertical: string,
  limit = 5,
): Promise<SourcedImage[]> {
  for (const query of imageQueries(title, vertical)) {
    const images = await findImages(query, limit);
    if (images.length > 0) return images;
  }
  return [];
}
