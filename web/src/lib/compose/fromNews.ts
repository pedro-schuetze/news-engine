/** A post selected from the current Google News snapshot.
 * Scheduled snapshots never call an LLM; this runs only after an editor asks
 * to turn one of those stories into a post. */
import { generateDraft, type SourceLine } from "./draft";
import type { NewsStory, NewsSnapshot } from "../news";
import type { PipelineRun, Story } from "../types";

function verticalFor(section: string): string {
  if (section === "entertainment") return "entertainment";
  if (section === "world" || section === "brazil") return "politics";
  return "facts";
}

export async function composeFromNews(snapshot: NewsSnapshot, item: NewsStory, extracted?: SourceLine[], problems: string[] = []) {
  const started = Date.now();
  const storyId = `news-${item.id.slice(3)}-${Date.now().toString(36)}`;
  const suggestedVertical = verticalFor(item.section);
  const sources = (extracted ?? []).filter(s => s.url && s.description.length >= 700);
  if (!sources.length) throw new Error("Sem matéria lida: geração bloqueada.");
  const readCount = sources.length;
  const { draft, usage, model, vertical } = await generateDraft({ storyId, title: item.title, vertical: suggestedVertical, chooseVertical: item.section === "top" || item.section === "unclassified", sources, verificationSummary: `${readCount} matérias lidas. Leitura automática não equivale a checagem independente. Atribua dados e alegações aos veículos.` });
  const now = new Date().toISOString();
  const story: Story = {
    story_id: storyId, run_id: storyId, cluster_id: item.id, vertical,
    title: item.title, content_type: "FACT", is_rumor_or_claim: false, claim_attribution: "",
    trend_score: 0, trend_signals: {}, editorial_score: 0, editorial_sub_scores: {},
    editorial_reason: "Selected by an editor from Google News.", red_flags: [], final_score: 0,
    final_score_notes: [`Google News snapshot ${snapshot.id}`, `model: ${model}`], classification: null,
    verification: { status: "PARTIALLY_VERIFIED", supporting_source_count: Math.max(0, sources.length - 1), independent_source_count: new Set(sources.map(s => s.domain)).size, has_primary_source: false,
      primary_source: { article_id: `${storyId}-0`, name: sources[0].domain, url: sources[0].url!, source_domain: sources[0].domain, published_at: sources[0].published ?? item.published_at, source_type: "media", authority_score: 0, excerpt: sources[0].description.slice(0, 14000) },
      supporting_sources: sources.slice(1).map((source, index) => ({ article_id: `${storyId}-${index + 1}`, name: source.domain, url: source.url!, source_domain: source.domain, published_at: source.published ?? item.published_at, source_type: "media", authority_score: 0, excerpt: source.description.slice(0, 14000) })), contradictions_found: [], verification_notes: `${readCount} de ${Math.min(5, item.outlets.length)} matérias lidas. Leitura não equivale a verificação independente. ${problems.join(" · ")}` },
    draft, slide_media: [], article_count: sources.length, earliest_published_at: item.published_at,
    latest_published_at: item.published_at, selection_rank: item.rank, created_at: now,
  };
  const run: PipelineRun = { run_id: storyId, mode: "news", started_at: now, finished_at: now, lookback_hours: 0,
    stats: { articles_collected: sources.length, articles_by_collector: { "google-news-front-page": sources.length }, articles_after_dedupe: sources.length, duplicates_removed: 0, story_clusters: 1, clusters_classified: 1, clusters_discarded: 0, stories_selected: 1, llm_calls: 1, estimated_input_tokens: usage.input, estimated_output_tokens: usage.output, token_usage_source: "api", estimated_llm_cost_usd: null, duration_seconds: Math.round((Date.now() - started) / 1000), errors: problems },
    verticals: { [vertical]: { vertical, insufficient_quality_candidates: false, candidates_considered: 1, stories: [story] } }, debug: null };
  return { run, story, runFile: `manual_news_${snapshot.id}_${storyId}.json` };
}
