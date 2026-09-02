"""Entidades centrais do News Engine.

Separação conceitual (ver docs/architecture/overview.md):
  Article        -> uma matéria coletada de uma fonte
  StoryCluster   -> grupo de Articles sobre o MESMO acontecimento
  Story          -> o fato editorial consolidado (o que selecionamos e avaliamos)
  EditorialDraft -> um formato de conteúdo derivado de uma Story (ex.: carrossel de Instagram)
  MediaAsset     -> arquivo de mídia com provenance/direitos
  Publication    -> (futuro) uma Story publicada em um canal
  Review         -> avaliação humana de uma Story, separada da Story
  PipelineRun    -> um run completo do pipeline, com stats e debug

Verticais são strings ("entertainment", "politics", "facts"), definidas em
config/verticals.yaml — adicionar uma vertical não exige mexer neste arquivo.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Optional

from pydantic import BaseModel, BeforeValidator, Field, field_validator

DISCARD = "discard"


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── validadores utilitários ──────────────────────────────────────────


def _clamp_score(v: Any) -> int:
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, n))


def _clamp_unit(v: Any) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, n))


Score100 = Annotated[int, BeforeValidator(_clamp_score)]
Unit = Annotated[float, BeforeValidator(_clamp_unit)]


# ── enums ────────────────────────────────────────────────────────────


class ContentType(str, Enum):
    FACT = "FACT"
    CLAIM = "CLAIM"
    OPINION = "OPINION"
    POLL = "POLL"
    OFFICIAL_DECISION = "OFFICIAL_DECISION"
    RUMOR = "RUMOR"


def _coerce_content_type(v: Any) -> Any:
    if v is None or isinstance(v, ContentType):
        return v
    try:
        return ContentType(str(v).strip().upper())
    except ValueError:
        return None


MaybeContentType = Annotated[Optional[ContentType], BeforeValidator(_coerce_content_type)]


class VerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    PARTIALLY_VERIFIED = "PARTIALLY_VERIFIED"
    UNVERIFIED = "UNVERIFIED"


class ReviewStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SlideRole(str, Enum):
    HOOK = "HOOK"
    CONTEXT = "CONTEXT"
    FACTS = "FACTS"
    WHY_IT_MATTERS = "WHY_IT_MATTERS"
    CONCLUSION = "CONCLUSION"
    OTHER = "OTHER"


def _coerce_slide_role(v: Any) -> Any:
    if isinstance(v, SlideRole):
        return v
    try:
        return SlideRole(str(v).strip().upper().replace(" ", "_"))
    except ValueError:
        return SlideRole.OTHER


class ImageSourceType(str, Enum):
    AGENCY_PHOTO = "AGENCY_PHOTO"
    PRESS_ASSET = "PRESS_ASSET"
    AI_GENERATED = "AI_GENERATED"
    ILLUSTRATION = "ILLUSTRATION"
    SCREENSHOT = "SCREENSHOT"
    PUBLIC_DOMAIN = "PUBLIC_DOMAIN"
    OTHER = "OTHER"


def _coerce_image_source(v: Any) -> Any:
    if isinstance(v, ImageSourceType):
        return v
    try:
        return ImageSourceType(str(v).strip().upper().replace(" ", "_"))
    except ValueError:
        return ImageSourceType.OTHER


class AssetSourceType(str, Enum):
    GENERATED = "GENERATED"
    LICENSED = "LICENSED"
    PUBLIC_DOMAIN = "PUBLIC_DOMAIN"
    PRESS_ASSET = "PRESS_ASSET"
    ORIGINAL = "ORIGINAL"
    OTHER = "OTHER"


class PublicationStatus(str, Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


# ── coleta ───────────────────────────────────────────────────────────


class Article(BaseModel):
    article_id: str = Field(default_factory=new_id)
    title: str
    normalized_title: str = ""
    description: str = ""
    url: str
    canonical_url: str = ""
    source_name: str = ""
    source_domain: str = ""
    published_at: datetime
    collected_at: datetime = Field(default_factory=utcnow)
    original_query: str = ""
    collector: str = ""
    language: str = "und"
    country: str = ""
    possible_vertical: Optional[str] = None
    authority_score: Score100 = 50


class DedupRemoval(BaseModel):
    article_id: str
    title: str
    url: str
    source_domain: str = ""
    reason: str
    kept_article_id: str
    similarity: Optional[float] = None


class StoryCluster(BaseModel):
    cluster_id: str = Field(default_factory=new_id)
    canonical_title: str
    articles: list[Article]
    source_count: int = 0
    unique_domain_count: int = 0
    domains: list[str] = Field(default_factory=list)
    earliest_published_at: Optional[datetime] = None
    latest_published_at: Optional[datetime] = None
    language_distribution: dict[str, int] = Field(default_factory=dict)
    possible_verticals: dict[str, int] = Field(default_factory=dict)
    query_count: int = 0


class TrendScore(BaseModel):
    score: float = 0.0
    signals: dict[str, float] = Field(default_factory=dict)

    @field_validator("score")
    @classmethod
    def _bound(cls, v: float) -> float:
        return max(0.0, min(100.0, float(v)))


# ── classificação editorial ──────────────────────────────────────────


class VerticalAssignment(BaseModel):
    cluster_id: str = ""
    primary_vertical: str = DISCARD  # id da vertical ou "discard"
    vertical_scores: dict[str, Score100] = Field(default_factory=dict)
    classification_confidence: Unit = 0.0
    classification_reason: str = ""
    content_type: MaybeContentType = None
    assigned_by: str = "llm"  # llm | heuristic | fallback

    @field_validator("primary_vertical", mode="before")
    @classmethod
    def _lower(cls, v: Any) -> str:
        return str(v).strip().lower() if v is not None else DISCARD


class SourceRef(BaseModel):
    article_id: str
    name: str
    url: str
    source_domain: str = ""
    published_at: Optional[datetime] = None
    source_type: str = "media"  # official | agency_or_major | media
    authority_score: Score100 = 50


class Verification(BaseModel):
    status: VerificationStatus = VerificationStatus.UNVERIFIED
    supporting_source_count: int = 0
    independent_source_count: int = 0
    has_primary_source: bool = False
    primary_source: Optional[SourceRef] = None
    supporting_sources: list[SourceRef] = Field(default_factory=list)
    contradictions_found: list[str] = Field(default_factory=list)
    verification_notes: str = ""


# ── conteúdo editorial ───────────────────────────────────────────────


class CarouselSlide(BaseModel):
    slide_number: int = 1
    role: Annotated[SlideRole, BeforeValidator(_coerce_slide_role)] = SlideRole.OTHER
    headline: str = ""
    body: str = ""
    # Direção visual: o que a imagem deste slide deve mostrar (etapa 2 do projeto).
    image_direction: str = ""
    image_source_type: Annotated[ImageSourceType, BeforeValidator(_coerce_image_source)] = (
        ImageSourceType.AGENCY_PHOTO
    )


class EditorialDraft(BaseModel):
    draft_id: str = Field(default_factory=new_id)
    story_id: str = ""
    channel: str = "instagram_carousel"
    language: str = "pt-BR"
    original_story_title: str = ""
    instagram_headline: str = ""
    short_summary: str = ""
    why_it_matters: str = ""
    key_facts: list[str] = Field(default_factory=list)
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    slides: list[CarouselSlide] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


class Story(BaseModel):
    story_id: str = Field(default_factory=new_id)
    run_id: str = ""
    cluster_id: str = ""
    vertical: str
    title: str
    content_type: MaybeContentType = None
    is_rumor_or_claim: bool = False
    claim_attribution: str = ""
    trend_score: float = 0.0
    trend_signals: dict[str, float] = Field(default_factory=dict)
    editorial_score: Score100 = 0
    editorial_sub_scores: dict[str, Score100] = Field(default_factory=dict)
    editorial_reason: str = ""
    red_flags: list[str] = Field(default_factory=list)
    final_score: float = 0.0
    final_score_notes: list[str] = Field(default_factory=list)
    classification: Optional[VerticalAssignment] = None
    verification: Verification = Field(default_factory=Verification)
    draft: Optional[EditorialDraft] = None
    # imagens do carrossel, UMA POR SLIDE, geradas sob demanda quando o Pedro
    # clica em "gerar imagens" no dashboard (decisão de 2026-09-01: o run
    # automático produz só texto, para não gastar imagem em post rejeitado)
    slide_media: list["MediaAsset"] = Field(default_factory=list)
    # pool de candidatas de imagem (banco/upload) mantido pelo dashboard; o
    # pipeline não escreve aqui — o campo existe para a releitura de runs
    # validar sem descartar o que o dashboard gravou
    media_pool: list[dict[str, Any]] = Field(default_factory=list)
    article_count: int = 0
    earliest_published_at: Optional[datetime] = None
    latest_published_at: Optional[datetime] = None
    selection_rank: int = 0
    created_at: datetime = Field(default_factory=utcnow)


class Review(BaseModel):
    story_id: str
    run_id: str = ""
    vertical: str = ""
    review_status: ReviewStatus = ReviewStatus.PENDING
    reviewed_at: Optional[datetime] = None
    review_notes: str = ""


# ── mídia (preparação para o futuro; MVP só define o modelo) ─────────


class MediaProvenance(BaseModel):
    source_type: AssetSourceType = AssetSourceType.OTHER
    source_url: str = ""
    source_name: str = ""
    license: str = ""
    attribution_required: bool = False
    attribution_text: str = ""


class TextPlacement(str, Enum):
    """Onde o texto do slide cabe com mais contraste nesta imagem."""

    BOTTOM = "BOTTOM"
    TOP = "TOP"
    CENTER = "CENTER"


class MediaAsset(BaseModel):
    asset_id: str = Field(default_factory=new_id)
    story_id: str = ""
    draft_id: Optional[str] = None
    # a qual slide do carrossel este asset pertence (1-based; 0 = não atribuído)
    slide_number: int = 0
    type: str = "image"
    provider: str = "local"
    local_path: str = ""
    remote_url: Optional[str] = None
    mime_type: str = ""
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    provenance: MediaProvenance = Field(default_factory=MediaProvenance)
    created_at: datetime = Field(default_factory=utcnow)
    # análise de luminância (Pillow) usada pelo renderer para posicionar o texto
    # na área de maior contraste, em vez de sempre no mesmo lugar
    text_placement: TextPlacement = TextPlacement.BOTTOM
    text_align: str = "center"  # center | left | right
    prompt: str = ""  # prompt usado, quando gerada por IA
    estimated_cost_usd: Optional[float] = None


class Publication(BaseModel):
    """Modelo futuro — nenhuma publicação é criada no MVP."""

    publication_id: str = Field(default_factory=new_id)
    story_id: str = ""
    draft_id: str = ""
    channel: str = ""
    publication_target: str = ""
    status: PublicationStatus = PublicationStatus.DRAFT
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    remote_id: str = ""
    remote_url: str = ""
    created_at: datetime = Field(default_factory=utcnow)


# ── run do pipeline ──────────────────────────────────────────────────


class RunStats(BaseModel):
    articles_collected: int = 0
    articles_by_collector: dict[str, int] = Field(default_factory=dict)
    articles_after_dedupe: int = 0
    duplicates_removed: int = 0
    story_clusters: int = 0
    clusters_classified: int = 0
    clusters_discarded: int = 0
    stories_selected: int = 0
    llm_calls: int = 0
    estimated_input_tokens: int = 0
    estimated_output_tokens: int = 0
    token_usage_source: str = "api"  # api | estimate | mixed
    estimated_llm_cost_usd: Optional[float] = None
    illustrations_generated: int = 0
    estimated_image_cost_usd: Optional[float] = None
    duration_seconds: float = 0.0
    errors: list[str] = Field(default_factory=list)


class VerticalResult(BaseModel):
    vertical: str
    insufficient_quality_candidates: bool = False
    candidates_considered: int = 0
    stories: list[Story] = Field(default_factory=list)


class LLMCallLog(BaseModel):
    purpose: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    duration_seconds: float = 0.0
    attempts: int = 1
    ok: bool = True


class ClusterDebug(BaseModel):
    cluster_id: str
    canonical_title: str
    size: int
    domains: list[str] = Field(default_factory=list)
    languages: dict[str, int] = Field(default_factory=dict)
    queries: list[str] = Field(default_factory=list)
    trend_score: float = 0.0
    trend_signals: dict[str, float] = Field(default_factory=dict)
    article_titles: list[str] = Field(default_factory=list)
    sent_to_classification: bool = False


class CandidateDebug(BaseModel):
    cluster_id: str
    vertical: str
    canonical_title: str
    trend_score: float = 0.0
    editorial_score: Optional[int] = None
    final_score: Optional[float] = None
    verification_status: Optional[VerificationStatus] = None
    selected: bool = False
    decision: str = ""


class DebugReport(BaseModel):
    articles: list[Article] = Field(default_factory=list)
    dedup_removals: list[DedupRemoval] = Field(default_factory=list)
    clusters: list[ClusterDebug] = Field(default_factory=list)
    classifications: list[VerticalAssignment] = Field(default_factory=list)
    unclassified_cluster_ids: list[str] = Field(default_factory=list)
    candidates: list[CandidateDebug] = Field(default_factory=list)
    llm_log: list[LLMCallLog] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PipelineRun(BaseModel):
    run_id: str = Field(default_factory=new_id)
    mode: str = "live"  # live | mock
    started_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None
    lookback_hours: int = 18
    stats: RunStats = Field(default_factory=RunStats)
    verticals: dict[str, VerticalResult] = Field(default_factory=dict)
    debug: Optional[DebugReport] = None


# ── schemas de resposta do LLM (structured output validado) ──────────


class ClassificationItem(BaseModel):
    index: int
    primary_vertical: str = DISCARD
    vertical_scores: dict[str, Score100] = Field(default_factory=dict)
    confidence: Unit = 0.0
    reason: str = ""
    content_type: MaybeContentType = None
    duplicate_of_index: Optional[int] = None

    @field_validator("primary_vertical", mode="before")
    @classmethod
    def _lower(cls, v: Any) -> str:
        return str(v).strip().lower() if v is not None else DISCARD


class ClassificationBatch(BaseModel):
    classifications: list[ClassificationItem] = Field(default_factory=list)


class EditorialItem(BaseModel):
    index: int
    sub_scores: dict[str, Score100] = Field(default_factory=dict)
    editorial_score: Score100 = 0
    reason: str = ""
    red_flags: list[str] = Field(default_factory=list)
    is_rumor_or_claim: bool = False
    claim_attribution: str = ""
    verification_notes: str = ""
    contradictions: list[str] = Field(default_factory=list)
    content_type: MaybeContentType = None
    # mesmo acontecimento que outro item do batch (clusters que o clustering
    # lexical não uniu — ex.: manchetes muito diferentes ou idiomas distintos)
    duplicate_of_index: Optional[int] = None


class EditorialBatch(BaseModel):
    items: list[EditorialItem] = Field(default_factory=list)


class DraftSlideOutput(BaseModel):
    slide_number: int = 1
    role: str = "OTHER"
    headline: str = ""
    body: str = ""
    image_direction: str = ""
    image_source_type: str = "AGENCY_PHOTO"


class DraftOutput(BaseModel):
    original_story_title: str = ""
    instagram_headline: str = ""
    short_summary: str = ""
    why_it_matters: str = ""
    key_facts: list[str] = Field(default_factory=list)
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    slides: list[DraftSlideOutput] = Field(default_factory=list)

    @field_validator("slides")
    @classmethod
    def _slide_count(cls, v: list[DraftSlideOutput]) -> list[DraftSlideOutput]:
        if not 3 <= len(v) <= 7:
            raise ValueError(f"carrossel deve ter entre 3 e 7 slides, veio {len(v)}")
        return v

    @field_validator("instagram_headline")
    @classmethod
    def _headline_completa(cls, v: str) -> str:
        # Guarda contra truncamento visto em produção (2026-09-02: a manchete
        # veio só "EUA prometem"). Roda dentro do retry do LLMClient.generate,
        # então a mensagem abaixo volta ao modelo na retentativa. Só valida o
        # campo quando ele vem na resposta (default vazio não passa por aqui).
        v = v.strip()
        if v and (len(v) < 18 or len(v.split()) < 3):
            raise ValueError(
                f"instagram_headline incompleta ou truncada: {v!r} — escreva a "
                "manchete inteira (3+ palavras, frase com sentido completo, até "
                "~60 caracteres)"
            )
        return v

    @field_validator("hashtags", mode="before")
    @classmethod
    def _norm_tags(cls, v: Any) -> Any:
        if isinstance(v, list):
            out = []
            for t in v:
                t = str(t).strip().replace(" ", "")
                if not t:
                    continue
                out.append(t if t.startswith("#") else f"#{t}")
            return out
        return v

    def to_draft(self, story_id: str) -> EditorialDraft:
        slides = [
            CarouselSlide(
                slide_number=i + 1,
                role=s.role,  # coerção acontece no validador do CarouselSlide
                headline=s.headline.strip(),
                body=s.body.strip(),
                image_direction=s.image_direction.strip(),
                image_source_type=s.image_source_type,
            )
            for i, s in enumerate(self.slides)
        ]
        return EditorialDraft(
            story_id=story_id,
            original_story_title=self.original_story_title.strip(),
            instagram_headline=self.instagram_headline.strip(),
            short_summary=self.short_summary.strip(),
            why_it_matters=self.why_it_matters.strip(),
            key_facts=[k.strip() for k in self.key_facts if k.strip()],
            caption=self.caption.strip(),
            hashtags=self.hashtags,
            slides=slides,
        )


# Story referencia MediaAsset, declarado depois — resolve a forward ref
Story.model_rebuild()
