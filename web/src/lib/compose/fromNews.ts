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

export async function composeFromNews(snapshot: NewsSnapshot, item: NewsStory) {
  const storyId = `news-${item.id.slice(3)}`;
  const vertical = verticalFor(item.section);
  const sources: SourceLine[] = item.outlets.map((outlet) => ({
    domain: outlet.domain || outlet.name,
    title: outlet.title,
    description: "",
    published: item.published_at ?? undefined,
  }));
  if (!sources.length) sources.push({ domain: "Google News", title: item.title, description: "", published: item.published_at ?? undefined });
  const { draft, usage, model } = await generateDraft({ storyId, title: item.title, vertical, sources });
  const now = new Date().toISOString();
  const story: Story = {
    story_id: storyId, run_id: `news-${snapshot.id}`, cluster_id: item.id, vertical,
    title: item.title, content_type: "FACT", is_rumor_or_claim: false, claim_attribution: "",
    trend_score: 0, trend_signals: {}, editorial_score: 0, editorial_sub_scores: {},
    editorial_reason: "Selected by an editor from Google News.", red_flags: [], final_score: 0,
    final_score_notes: [`Google News snapshot ${snapshot.id}`, `model: ${model}`], classification: null,
    verification: { status: sources.length >= 2 ? "VERIFIED" : "PARTIALLY_VERIFIED", supporting_source_count: Math.max(0, sources.length - 1), independent_source_count: sources.length, has_primary_source: true,
      primary_source: { article_id: `${storyId}-0`, name: sources[0].domain, url: item.outlets[0]?.url || item.url, source_domain: sources[0].domain, published_at: item.published_at, source_type: "Google News", authority_score: 0 },
      supporting_sources: sources.slice(1).map((source, index) => ({ article_id: `${storyId}-${index + 1}`, name: source.domain, url: item.outlets[index + 1]?.url || item.url, source_domain: source.domain, published_at: item.published_at, source_type: "Google News", authority_score: 0 })), contradictions_found: [], verification_notes: `Google News listed ${sources.length} outlet${sources.length === 1 ? "" : "s"} for this story.` },
    draft, slide_media: [], article_count: sources.length, earliest_published_at: item.published_at,
    latest_published_at: item.published_at, selection_rank: item.rank, created_at: now,
  };
  const run: PipelineRun = { run_id: `news-${snapshot.id}`, mode: "news", started_at: now, finished_at: now, lookback_hours: 0,
    stats: { articles_collected: sources.length, articles_by_collector: { "google-news-front-page": sources.length }, articles_after_dedupe: sources.length, duplicates_removed: 0, story_clusters: 1, clusters_classified: 1, clusters_discarded: 0, stories_selected: 1, llm_calls: 1, estimated_input_tokens: usage.input, estimated_output_tokens: usage.output, token_usage_source: "api", estimated_llm_cost_usd: null, duration_seconds: 0, errors: [] },
    verticals: { [vertical]: { vertical, insufficient_quality_candidates: false, candidates_considered: 1, stories: [story] } }, debug: null };
  return { run, story, runFile: `manual_news_${snapshot.id}_${item.id}.json` };
}
