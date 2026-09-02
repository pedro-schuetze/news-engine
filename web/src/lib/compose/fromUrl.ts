/**
 * "Gerar post" a partir de link: lê a matéria, monta uma story e produz o
 * mesmo pacote editorial do pipeline automático.
 *
 * A extração é deliberadamente simples (og:tags, title, meta description e os
 * primeiros parágrafos). Não é um leitor de artigos completo: o objetivo é dar
 * ao modelo o mesmo material que ele receberia do collector — título, veículo
 * e um resumo — sem trazer uma dependência de parsing para o projeto.
 */

import { generateDraft, type ComposeFormat, type SourceLine } from "./draft";
import type { PipelineRun, Story } from "../types";

const FETCH_TIMEOUT_MS = 15_000;

export interface ExtractedArticle {
  url: string;
  domain: string;
  title: string;
  description: string;
  publishedAt?: string;
  excerpt: string;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    hellip: "…",
    laquo: "«",
    raquo: "»",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    atilde: "ã",
    otilde: "õ",
    ccedil: "ç",
    acirc: "â",
    ecirc: "ê",
    ocirc: "ô",
    agrave: "à",
  };
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m);
}

function meta(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeEntities(m[1].trim());
  }
  return "";
}

function textFromParagraphs(html: string, limit = 1200): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ");
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
    .filter((p) => p.length > 60);
  let out = "";
  for (const p of paragraphs) {
    if (out.length + p.length > limit) break;
    out += (out ? " " : "") + p;
  }
  return out;
}

export async function extractArticle(rawUrl: string): Promise<ExtractedArticle> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`link inválido: ${rawUrl.slice(0, 60)}`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`só links http/https: ${rawUrl.slice(0, 60)}`);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; news-engine/0.3; +https://github.com/pedro-schuetze/news-engine)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url.hostname} respondeu ${res.status}`);
  const html = (await res.text()).slice(0, 900_000);

  const title =
    meta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]) || url.hostname;

  const description = meta(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const publishedAt = meta(html, [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ]);

  return {
    url: url.toString(),
    domain: url.hostname.replace(/^www\./, ""),
    title: title.replace(/\s+/g, " ").slice(0, 300),
    description: description.slice(0, 600),
    publishedAt: publishedAt || undefined,
    excerpt: textFromParagraphs(html),
  };
}

/** Cria um run manual com UM post, no mesmo formato do pipeline. */
export async function composeFromUrls(opts: {
  urls: string[];
  instruction?: string;
  vertical?: string;
  format?: ComposeFormat;
}): Promise<{ run: PipelineRun; runFile: string; story: Story; problems: string[] }> {
  const problems: string[] = [];
  const articles: ExtractedArticle[] = [];

  for (const url of opts.urls.slice(0, 6)) {
    try {
      articles.push(await extractArticle(url));
    } catch (e) {
      problems.push(String(e).replace(/^Error:\s*/, "").slice(0, 160));
    }
  }
  if (articles.length === 0) {
    throw new Error(
      `não consegui ler nenhum dos links${problems.length ? `: ${problems.join(" · ")}` : ""}`,
    );
  }

  const storyId = `manual-${Date.now().toString(36)}-${Math.floor(Date.now() % 997)}`;
  const sources: SourceLine[] = articles.map((a) => ({
    domain: a.domain,
    title: a.title,
    description: [a.description, a.excerpt].filter(Boolean).join(" "),
    published: a.publishedAt,
  }));

  const { draft, vertical, usage, model } = await generateDraft({
    storyId,
    title: articles[0].title,
    vertical: opts.vertical || "facts",
    sources,
    instruction: opts.instruction,
    chooseVertical: !opts.vertical,
    format: opts.format,
  });

  const now = new Date().toISOString();
  const story: Story = {
    story_id: storyId,
    run_id: storyId,
    cluster_id: storyId,
    vertical,
    title: draft.original_story_title || articles[0].title,
    content_type: "FACT",
    is_rumor_or_claim: false,
    claim_attribution: "",
    trend_score: 0,
    trend_signals: {},
    editorial_score: 0,
    editorial_sub_scores: {},
    editorial_reason: "post criado manualmente a partir de link",
    red_flags: [],
    final_score: 0,
    final_score_notes: ["post manual: sem score de trend/editorial", `modelo: ${model}`],
    classification: null,
    verification: {
      status: articles.length >= 2 ? "VERIFIED" : "PARTIALLY_VERIFIED",
      supporting_source_count: articles.length,
      independent_source_count: new Set(articles.map((a) => a.domain)).size,
      has_primary_source: false,
      primary_source: {
        article_id: `${storyId}-0`,
        name: articles[0].domain,
        url: articles[0].url,
        source_domain: articles[0].domain,
        published_at: articles[0].publishedAt ?? null,
        source_type: "media",
        authority_score: 50,
      },
      supporting_sources: articles.slice(1).map((a, i) => ({
        article_id: `${storyId}-${i + 1}`,
        name: a.domain,
        url: a.url,
        source_domain: a.domain,
        published_at: a.publishedAt ?? null,
        source_type: "media",
        authority_score: 50,
      })),
      contradictions_found: [],
      verification_notes: `Post manual a partir de ${articles.length} link(s) informado(s) pelo editor.`,
    },
    draft,
    slide_media: [],
    article_count: articles.length,
    earliest_published_at: articles[0].publishedAt ?? null,
    latest_published_at: articles[0].publishedAt ?? null,
    selection_rank: 1,
    created_at: now,
  };

  const run: PipelineRun = {
    run_id: storyId,
    mode: "manual",
    started_at: now,
    finished_at: now,
    lookback_hours: 0,
    stats: {
      articles_collected: articles.length,
      articles_by_collector: { manual: articles.length },
      articles_after_dedupe: articles.length,
      duplicates_removed: 0,
      story_clusters: 1,
      clusters_classified: 1,
      clusters_discarded: 0,
      stories_selected: 1,
      llm_calls: 1,
      estimated_input_tokens: usage.input,
      estimated_output_tokens: usage.output,
      token_usage_source: "api",
      estimated_llm_cost_usd: null,
      duration_seconds: 0,
      errors: problems,
    },
    verticals: {
      [vertical]: {
        vertical,
        insufficient_quality_candidates: false,
        candidates_considered: 1,
        stories: [story],
      },
    },
    debug: null,
  };

  const stamp = now.replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
  return { run, runFile: `manual_${stamp}.json`, story, problems };
}
