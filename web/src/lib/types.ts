/**
 * Tipos espelhando o contrato JSON do pipeline Python (src/models.py).
 * Datas chegam como ISO strings; campos opcionais podem vir null.
 */

export type VerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Article {
  article_id: string;
  title: string;
  normalized_title: string;
  description: string;
  url: string;
  canonical_url: string;
  source_name: string;
  source_domain: string;
  published_at: string;
  collected_at: string;
  original_query: string;
  collector: string;
  language: string;
  country: string;
  possible_vertical: string | null;
  authority_score: number;
}

export interface DedupRemoval {
  article_id: string;
  title: string;
  url: string;
  source_domain: string;
  reason: string;
  kept_article_id: string;
  similarity: number | null;
}

export interface VerticalAssignment {
  cluster_id: string;
  primary_vertical: string;
  vertical_scores: Record<string, number>;
  classification_confidence: number;
  classification_reason: string;
  content_type: string | null;
  assigned_by: string;
}

export interface SourceRef {
  article_id: string;
  name: string;
  url: string;
  source_domain: string;
  published_at: string | null;
  source_type: string;
  authority_score: number;
}

export interface Verification {
  status: VerificationStatus;
  supporting_source_count: number;
  independent_source_count: number;
  has_primary_source: boolean;
  primary_source: SourceRef | null;
  supporting_sources: SourceRef[];
  contradictions_found: string[];
  verification_notes: string;
}

export interface CarouselSlide {
  slide_number: number;
  role: string;
  headline: string;
  body: string;
  image_direction: string;
  image_source_type: string;
}

export interface EditorialDraft {
  draft_id: string;
  story_id: string;
  channel: string;
  language: string;
  original_story_title: string;
  instagram_headline: string;
  short_summary: string;
  why_it_matters: string;
  key_facts: string[];
  caption: string;
  hashtags: string[];
  slides: CarouselSlide[];
  created_at: string;
}

export interface MediaAsset {
  asset_id: string;
  story_id: string;
  slide_number: number;
  type: string;
  local_path: string;
  remote_url: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  provenance: {
    source_type: string;
    source_name: string;
    license: string;
    attribution_required: boolean;
    attribution_text: string;
  };
  text_placement: "TOP" | "CENTER" | "BOTTOM";
  text_align: "left" | "center" | "right";
  prompt: string;
  estimated_cost_usd: number | null;
  focus_x?: number;
  focus_y?: number;
}

/**
 * Candidata de imagem no pool do post (banco ou upload). A SELEÇÃO por slide
 * continua sendo slide_media — o renderer não conhece o pool.
 */
export interface MediaCandidate {
  id: string;
  local_path: string;
  origin: "bank" | "upload";
  source: string; // wikimedia | openverse | ai (ChatGPT)
  mime_type: string;
  credit: string;
  text_placement: "TOP" | "CENTER" | "BOTTOM";
  text_align: "left" | "center" | "right";
  /** pré-seleção por código: relevância + espaço para texto + nitidez (0-100) */
  score: number;
  score_notes: string;
  added_at: string;
  /** ponto focal do conteúdo (0-1): rostos ou saliência — guia o corte 4:5 */
  focus_x?: number;
  focus_y?: number;
  width?: number;
  height?: number;
}

export interface Story {
  story_id: string;
  run_id: string;
  cluster_id: string;
  vertical: string;
  title: string;
  content_type: string | null;
  is_rumor_or_claim: boolean;
  claim_attribution: string;
  trend_score: number;
  trend_signals: Record<string, number>;
  editorial_score: number;
  editorial_sub_scores: Record<string, number>;
  editorial_reason: string;
  red_flags: string[];
  final_score: number;
  final_score_notes: string[];
  classification: VerticalAssignment | null;
  verification: Verification;
  draft: EditorialDraft | null;
  slide_media?: MediaAsset[];
  media_pool?: MediaCandidate[];
  article_count: number;
  earliest_published_at: string | null;
  latest_published_at: string | null;
  selection_rank: number;
  created_at: string;
}

export interface Review {
  story_id: string;
  run_id: string;
  vertical: string;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_notes: string;
}

export interface RunStats {
  articles_collected: number;
  articles_by_collector: Record<string, number>;
  articles_after_dedupe: number;
  duplicates_removed: number;
  story_clusters: number;
  clusters_classified: number;
  clusters_discarded: number;
  stories_selected: number;
  llm_calls: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  token_usage_source: string;
  estimated_llm_cost_usd: number | null;
  illustrations_generated?: number;
  estimated_image_cost_usd?: number | null;
  duration_seconds: number;
  errors: string[];
}

export interface VerticalResult {
  vertical: string;
  insufficient_quality_candidates: boolean;
  candidates_considered: number;
  stories: Story[];
}

export interface LLMCallLog {
  purpose: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_seconds: number;
  attempts: number;
  ok: boolean;
}

export interface ClusterDebug {
  cluster_id: string;
  canonical_title: string;
  size: number;
  domains: string[];
  languages: Record<string, number>;
  queries: string[];
  trend_score: number;
  trend_signals: Record<string, number>;
  article_titles: string[];
  sent_to_classification: boolean;
}

export interface CandidateDebug {
  cluster_id: string;
  vertical: string;
  canonical_title: string;
  trend_score: number;
  editorial_score: number | null;
  final_score: number | null;
  verification_status: VerificationStatus | null;
  selected: boolean;
  decision: string;
}

export interface DebugReport {
  articles: Article[];
  dedup_removals: DedupRemoval[];
  clusters: ClusterDebug[];
  classifications: VerticalAssignment[];
  unclassified_cluster_ids: string[];
  candidates: CandidateDebug[];
  llm_log: LLMCallLog[];
  notes: string[];
}

export interface PipelineRun {
  run_id: string;
  mode: string;
  started_at: string;
  finished_at: string | null;
  lookback_hours: number;
  stats: RunStats;
  verticals: Record<string, VerticalResult>;
  debug: DebugReport | null;
}

export interface RunListItem {
  file: string; // nome do arquivo em data/runs/ (chave de seleção)
  label: string;
}
