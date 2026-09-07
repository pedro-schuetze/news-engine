import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export interface ExtractedArticle {
  url: string;
  domain: string;
  title: string;
  description: string;
  publishedAt?: string;
  excerpt: string;
}

export function publicAddress(address: string): boolean {
  if (address.includes(":")) {
    // Only global unicast IPv6; reject mapped IPv4 and local/link-local ranges.
    return /^[23][0-9a-f]{3}:/i.test(address);
  }
  const [a, b] = address.split(".").map(Number);
  return isIP(address) === 4 && a > 0 && a < 224 && a !== 10 && a !== 127 &&
    !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19));
}

async function validateUrl(raw: string) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port))) throw new Error("Link público http/https obrigatório.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error("Endereço privado não permitido.");
  return url;
}

async function page(raw: string, signal: AbortSignal, init?: RequestInit): Promise<{ url: string; html: string }> {
  let url = await validateUrl(raw);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const response = await fetch(url, {
      ...init, signal, redirect: "manual", cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Iris/1.0)", Accept: "text/html,application/xhtml+xml", ...init?.headers },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Redirecionamento sem destino.");
      url = await validateUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`${url.hostname}: HTTP ${response.status}`); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Página vazia.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3_000_000) { await reader.cancel(); throw new Error("Página excede o limite de leitura."); }
      chunks.push(value);
    }
    return { url: url.href, html: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("Redirecionamentos demais.");
}

// Google's article links are wrappers, not article bodies. This undocumented
// RPC can change: failure is reported as unread, never replaced by its metadata.
// Protocol reference: github.com/zindont/google-news-url-decoder
export async function resolveGoogleArticle(raw: string, signal: AbortSignal): Promise<string> {
  const url = new URL(raw);
  if (url.hostname !== "news.google.com") return raw;
  const id = url.pathname.match(/\/(?:articles|read)\/([\w-]+)/)?.[1];
  if (!id) throw new Error("Link do Google News sem identificador de matéria.");
  const wrapper = await page(`https://news.google.com/rss/articles/${id}?hl=pt-BR&gl=BR&ceid=BR:pt`, signal);
  if (new URL(wrapper.url).hostname !== "news.google.com") return wrapper.url;
  const { document } = parseHTML(wrapper.html);
  const node = document.querySelector("[data-n-a-sg][data-n-a-ts]");
  const signature = node?.getAttribute("data-n-a-sg");
  const timestamp = node?.getAttribute("data-n-a-ts");
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) throw new Error("Google News não revelou o link original.");
  const context = [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0];
  const payload = JSON.stringify(["garturlreq", context, id, Number(timestamp), signature]);
  const response = await page("https://news.google.com/_/DotsSplashUi/data/batchexecute", signal, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", payload]]]) }),
  });
  for (const line of response.html.split("\n")) {
    if (!line.startsWith("[[")) continue;
    try {
      const rows = JSON.parse(line) as unknown[][];
      for (const row of rows) {
        if (row[1] !== "Fbv4je" || typeof row[2] !== "string") continue;
        const result = JSON.parse(row[2]);
        if (result[0] === "garturlres" && typeof result[1] === "string" && new URL(result[1]).hostname !== "news.google.com") return result[1];
      }
    } catch { /* another RPC frame */ }
  }
  throw new Error("Não foi possível resolver o link do veículo original.");
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function parseArticle(html: string, rawUrl: string): ExtractedArticle {
  const url = new URL(rawUrl);
  if (url.hostname === "news.google.com" || /(^|\.)consent\.google\.com$/.test(url.hostname)) throw new Error("Página genérica do Google; matéria não lida.");
  const { document } = parseHTML(html);
  const meta = (name: string) => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute("content") ?? "";
  const title = clean(meta("og:title") || document.title);
  const description = clean(meta("description") || meta("og:description"));
  const publishedAt = meta("article:published_time") || undefined;
  let structuredBody = "";
  let articleMetadata = false;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const obj = value as Record<string, unknown>;
    if (/Article|NewsArticle|ReportageNewsArticle/.test(String(obj["@type"]))) articleMetadata = true;
    if (/Article|NewsArticle|ReportageNewsArticle/.test(String(obj["@type"])) && typeof obj.articleBody === "string") {
      const text = clean(parseHTML(`<html><body>${obj.articleBody}</body></html>`).document.body.textContent ?? obj.articleBody);
      if (text.length > structuredBody.length) structuredBody = text;
    }
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
    try { visit(JSON.parse(el.textContent ?? "")); } catch { /* invalid publisher metadata */ }
  });
  if (url.pathname === "/" || (!articleMetadata && !document.querySelector("article") && meta("og:type") !== "article")) throw new Error(`${url.hostname}: página sem estrutura de matéria.`);
  document.querySelectorAll("nav,footer,aside,[role=dialog],[aria-modal=true],audio,video").forEach(el => el.remove());
  const article = new Readability(document as unknown as Document, { charThreshold: 500 }).parse();
  const body = clean(structuredBody || article?.textContent || "");
  if (!title || body.length < 700 || body.split(/\s+/).length < 100 ||
      /^(just a moment|access denied|verifique se voc[eê]|enable javascript)/i.test(title)) {
    throw new Error(`${url.hostname}: conteúdo insuficiente ou acesso bloqueado; matéria não lida.`);
  }
  return { url: url.href, domain: url.hostname.replace(/^www\./, ""), title: title.slice(0, 300), description: description.slice(0, 600), publishedAt, excerpt: body.slice(0, 14000) };
}

export async function extractArticle(raw: string): Promise<ExtractedArticle> {
  const signal = AbortSignal.timeout(35_000);
  const resolved = await resolveGoogleArticle(raw.trim(), signal);
  const result = await page(resolved, signal);
  return parseArticle(result.html, result.url);
}
