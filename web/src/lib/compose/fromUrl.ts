import { generateDraft, type ComposeFormat, type SourceLine } from "./draft";
import type { PipelineRun, Story } from "../types";
import { extractArticle, type ExtractedArticle } from "./article";
export { extractArticle } from "./article";
export type { ExtractedArticle } from "./article";

/** Cria um run manual com UM post, no mesmo formato do pipeline. */
export async function composeFromUrls(opts: {
  urls: string[];
  instruction?: string;
  vertical?: string;
  format?: ComposeFormat;
}): Promise<{ run: PipelineRun; runFile: string; story: Story; problems: string[] }> {
  const problems: string[] = [];
  const articles: ExtractedArticle[] = [];

  const results = await Promise.allSettled(opts.urls.slice(0, 6).map(url => extractArticle(url)));
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (!articles.some(a => a.url === result.value.url)) articles.push(result.value);
    } else problems.push(`Link ${index + 1}: ${String(result.reason).replace(/^Error:\s*/, "").slice(0, 160)}`);
  });
  if (articles.length === 0) {
    throw new Error(
      `não consegui ler nenhum dos links${problems.length ? `: ${problems.join(" · ")}` : ""}`,
    );
  }

  const storyId = `manual-${Date.now().toString(36)}-${Math.floor(Date.now() % 997)}`;
  const sources: SourceLine[] = articles.map((a) => ({
    domain: a.domain,
    url: a.url,
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
      status: "PARTIALLY_VERIFIED",
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
        excerpt: [articles[0].description, articles[0].excerpt].filter(Boolean).join(" ").slice(0, 14000),
      },
      supporting_sources: articles.slice(1).map((a, i) => ({
        article_id: `${storyId}-${i + 1}`,
        name: a.domain,
        url: a.url,
        source_domain: a.domain,
        published_at: a.publishedAt ?? null,
        source_type: "media",
        authority_score: 50,
        excerpt: [a.description, a.excerpt].filter(Boolean).join(" ").slice(0, 14000),
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
