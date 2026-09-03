"""Orquestrador do News Engine.

Fluxo: COLLECT -> NORMALIZE -> DEDUPLICATE -> CLUSTER -> TREND SCORE ->
EDITORIAL ROUTER -> RANK (LLM editorial + fórmula determinística) ->
VERIFY -> SELECT -> DRAFT -> SAVE (JSON via NewsRepository).

Execução:
  python -m src.pipeline            # modo do .env (live por padrão)
  python -m src.pipeline --mock     # fixtures + LLM simulado (custo zero)

Princípios: falha de fonte não derruba o run; falha de UMA story não derruba
as demais; falha total de etapa crítica encerra com erro claro (exit 1).
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timezone

from src.collectors.base import Collector
from src.collectors.fixtures import DEFAULT_FIXTURE_PATH, FixtureCollector
from src.collectors.gdelt import GdeltCollector
from src.collectors.google_news import GoogleNewsCollector
from src.collectors.rss import CuratedRssCollector
from src.config import (
    RankingConfig,
    Settings,
    VerticalConfig,
    load_domain_authority,
    load_ranking,
    load_sources,
    load_verticals,
    source_authority_map,
)
from src.editorial.router import (
    ClassificationError,
    classify_clusters,
    pick_classification_pool,
)
from src.editorial.scorer import score_vertical_candidates
from src.editorial.writer import write_draft
from src.llm.base import LLMClient, LLMError, LLMValidationError, build_llm_client
from src.models import (
    DISCARD,
    CandidateDebug,
    ClusterDebug,
    DebugReport,
    PipelineRun,
    RunStats,
    Story,
    StoryCluster,
    TrendScore,
    VerticalAssignment,
    VerticalResult,
)
from src.processing.cluster import build_clusters
from src.processing.deduplicate import deduplicate
from src.processing.normalize import normalize_articles
from src.processing.ranking import compute_final_score, compute_trend_score, select_stories
from src.media.local_storage import LocalMediaStorage
from src.processing.verify import build_verification
from src.repositories.base import NewsRepository
from src.repositories.json_repository import JsonNewsRepository

log = logging.getLogger("news_engine.pipeline")


class PipelineError(Exception):
    """Falha crítica — o run não pode produzir resultado útil."""


def _build_collectors(
    settings: Settings,
    verticals: dict[str, VerticalConfig],
    sources,
    now: datetime,
    mock: bool,
    fixture_path: str | None,
) -> list[Collector]:
    common = dict(
        now=now,
        lookback_hours=settings.news_lookback_hours,
        timeout=settings.http_timeout_seconds,
    )
    if mock:
        return [FixtureCollector(fixture_path or DEFAULT_FIXTURE_PATH, **common)]
    return [
        GoogleNewsCollector(verticals, **common),
        GdeltCollector(verticals, **common),
        CuratedRssCollector(sources, **common),
    ]


def _process_vertical(
    vertical: VerticalConfig,
    candidates: list[tuple[StoryCluster, TrendScore, VerticalAssignment]],
    *,
    run: PipelineRun,
    settings: Settings,
    ranking_cfg: RankingConfig,
    authority_map: dict[str, int],
    llm: LLMClient,
    writer_llm: LLMClient,
    errors: list[str],
    candidates_debug: list[CandidateDebug],
    notes: list[str],
    storage: LocalMediaStorage | None = None,
) -> VerticalResult:
    vid = vertical.id
    editorial_scores, dup_dropped, sc_errors = score_vertical_candidates(
        vertical, [(c, t) for c, t, _ in candidates], llm, ranking_cfg.llm_budget
    )
    errors.extend(sc_errors)

    rules = ranking_cfg.verification_rules(vid)
    stories: list[Story] = []
    cluster_by_story: dict[str, StoryCluster] = {}
    title_by_cluster = {c.cluster_id: c.canonical_title for c, _t, _a in candidates}

    for cluster, trend, assignment in candidates:
        if cluster.cluster_id in dup_dropped:
            kept_title = title_by_cluster.get(dup_dropped[cluster.cluster_id], "outro item")
            candidates_debug.append(
                CandidateDebug(
                    cluster_id=cluster.cluster_id,
                    vertical=vid,
                    canonical_title=cluster.canonical_title,
                    trend_score=trend.score,
                    decision=f"duplicata semântica de '{kept_title}' (detectada no score editorial)",
                )
            )
            continue
        item = editorial_scores.get(cluster.cluster_id)
        if item is None:
            candidates_debug.append(
                CandidateDebug(
                    cluster_id=cluster.cluster_id,
                    vertical=vid,
                    canonical_title=cluster.canonical_title,
                    trend_score=trend.score,
                    decision="sem score editorial (fora do cap de candidatos ou falha LLM)",
                )
            )
            continue

        verification = build_verification(cluster, vertical, rules, authority_map, item)
        final, excluded, score_notes = compute_final_score(
            vid, trend.score, item.editorial_score, verification.status, ranking_cfg
        )
        story = Story(
            run_id=run.run_id,
            cluster_id=cluster.cluster_id,
            vertical=vid,
            title=cluster.canonical_title,
            content_type=item.content_type or assignment.content_type,
            is_rumor_or_claim=item.is_rumor_or_claim,
            claim_attribution=item.claim_attribution,
            trend_score=trend.score,
            trend_signals=trend.signals,
            editorial_score=item.editorial_score,
            editorial_sub_scores=item.sub_scores,
            editorial_reason=item.reason,
            red_flags=item.red_flags,
            final_score=final,
            final_score_notes=score_notes,
            classification=assignment,
            verification=verification,
            article_count=cluster.source_count,
            earliest_published_at=cluster.earliest_published_at,
            latest_published_at=cluster.latest_published_at,
        )
        if excluded:
            candidates_debug.append(
                CandidateDebug(
                    cluster_id=cluster.cluster_id,
                    vertical=vid,
                    canonical_title=cluster.canonical_title,
                    trend_score=trend.score,
                    editorial_score=item.editorial_score,
                    final_score=final,
                    verification_status=verification.status,
                    decision="excluída da seleção: verificação insuficiente nesta vertical",
                )
            )
            continue
        stories.append(story)
        cluster_by_story[story.story_id] = cluster

    min_score = ranking_cfg.min_final_score(vid)
    selected, insufficient, decisions = select_stories(
        stories,
        settings.min_stories_per_vertical,
        settings.max_stories_per_vertical,
        min_score,
    )
    notes.extend(f"[{vid}] {d}" for d in decisions)

    selected_ids = {s.story_id for s in selected}
    for story in stories:
        if story.story_id in selected_ids:
            decision = f"selecionada (rank {story.selection_rank})"
        elif story.final_score < min_score:
            decision = f"abaixo do threshold ({min_score:g})"
        else:
            decision = "quota cheia (max_stories_per_vertical)"
        candidates_debug.append(
            CandidateDebug(
                cluster_id=story.cluster_id,
                vertical=vid,
                canonical_title=story.title,
                trend_score=story.trend_score,
                editorial_score=story.editorial_score,
                final_score=story.final_score,
                verification_status=story.verification.status,
                selected=story.story_id in selected_ids,
                decision=decision,
            )
        )

    # drafts só para as selecionadas (qualidade > volume; 1 chamada por story)
    for story in selected:
        try:
            story.draft = write_draft(
                story, cluster_by_story[story.story_id], vertical, writer_llm
            )
        except (LLMValidationError, LLMError) as e:
            msg = f"draft falhou para '{story.title}' ({vid}): {e}"
            errors.append(msg)
            log.warning("[draft] %s", msg)

    # NÃO geramos imagem aqui: o run automático produz só texto. As 5 imagens
    # de um post são geradas quando o Pedro clica em "gerar imagens" no
    # dashboard (POST /api/media/{story_id}), para não gastar geração em post
    # que será rejeitado e para permitir cuidado caso a caso.

    if insufficient:
        log.info(
            "[rank] %s: apenas %d de %d stories com qualidade suficiente "
            "(melhor menos e boas do que quota com ruins)",
            vid,
            len(selected),
            settings.min_stories_per_vertical,
        )
    return VerticalResult(
        vertical=vid,
        insufficient_quality_candidates=insufficient,
        candidates_considered=len(candidates),
        stories=selected,
    )


def run_pipeline(
    settings: Settings,
    *,
    mock: bool | None = None,
    fixture_path: str | None = None,
    repository: NewsRepository | None = None,
) -> PipelineRun:
    started = time.monotonic()
    now = datetime.now(timezone.utc)
    is_mock = mock if mock is not None else settings.pipeline_mode.strip().lower() == "mock"
    mode = "mock" if is_mock else "live"

    verticals = load_verticals(settings.config_dir)
    sources = load_sources(settings.config_dir)
    ranking_cfg = load_ranking(settings.config_dir)
    authority_map = source_authority_map(sources, load_domain_authority(settings.config_dir))
    repo = repository or JsonNewsRepository(settings.data_dir, settings.timezone)
    storage = LocalMediaStorage(f"{settings.data_dir}/media")
    llm = build_llm_client(settings, mock=is_mock)
    # writer com modelo próprio (texto é o produto); no mock é o mesmo client
    writer_llm = (
        llm
        if is_mock or settings.openai_writer_model == settings.openai_model
        else build_llm_client(settings, openai_model=settings.openai_writer_model)
    )
    # mesma lista de calls: a contabilidade do run (chamadas/tokens/custo)
    # enxerga o writer sem mudar nada no fechamento dos stats
    writer_llm.calls = llm.calls

    run = PipelineRun(mode=mode, started_at=now, lookback_hours=settings.news_lookback_hours)
    errors: list[str] = []
    notes: list[str] = []
    log.info("[run] id=%s mode=%s lookback=%dh", run.run_id, mode, settings.news_lookback_hours)

    # ── COLLECT ──────────────────────────────────────────────────────
    collectors = _build_collectors(settings, verticals, sources, now, is_mock, fixture_path)
    all_articles = []
    by_collector: dict[str, int] = {}
    for collector in collectors:
        try:
            items = collector.collect()
        except Exception as e:  # collector não deveria propagar, mas garantimos
            errors.append(f"collector {collector.name} falhou: {e}")
            log.error("[collect] %s falhou por completo: %s", collector.name, e)
            items = []
        by_collector[collector.name] = len(items)
        all_articles.extend(items)
        log.info("[collect] %s: %d articles", collector.name, len(items))

    if not all_articles:
        raise PipelineError(
            "nenhum artigo coletado em nenhuma fonte — verifique conectividade/queries"
        )

    # ── NORMALIZE + DEDUPE ───────────────────────────────────────────
    articles = normalize_articles(all_articles)
    for a in articles:
        a.authority_score = authority_map.get(a.source_domain, a.authority_score)
    kept, removals = deduplicate(articles)
    log.info("[dedupe] %d -> %d (-%d duplicatas)", len(articles), len(kept), len(removals))

    # ── CLUSTER + TREND ──────────────────────────────────────────────
    clusters = build_clusters(kept, ranking_cfg.cluster)
    log.info("[cluster] %d artigos -> %d story clusters", len(kept), len(clusters))
    prev_titles = repo.previous_story_titles(ranking_cfg.trend.novelty_lookback_runs)
    scored = [
        (c, compute_trend_score(c, ranking_cfg, authority_map, now, prev_titles))
        for c in clusters
    ]
    trend_by_id = {c.cluster_id: t for c, t in scored}

    # ── EDITORIAL ROUTER ─────────────────────────────────────────────
    pool, skipped_ids = pick_classification_pool(scored, verticals, ranking_cfg.llm_budget)
    log.info(
        "[router] %d clusters no pool de classificação (%d fora do pool)",
        len(pool),
        len(skipped_ids),
    )
    assignments, cls_errors = classify_clusters(pool, llm, verticals, ranking_cfg.llm_budget)
    errors.extend(cls_errors)

    counts = {vid: 0 for vid in verticals}
    discarded = 0
    for a in assignments.values():
        if a.primary_vertical == DISCARD:
            discarded += 1
        else:
            counts[a.primary_vertical] = counts.get(a.primary_vertical, 0) + 1
    for vid, n in counts.items():
        log.info("[router] %s: %d", vid, n)
    log.info("[router] descartados: %d", discarded)

    # ── POR VERTICAL: SCORE -> VERIFY -> SELECT -> DRAFT ─────────────
    cluster_by_id = {c.cluster_id: c for c in clusters}
    candidates_debug: list[CandidateDebug] = []
    vertical_results: dict[str, VerticalResult] = {}
    for vid, vcfg in verticals.items():
        cands = [
            (cluster_by_id[a.cluster_id], trend_by_id[a.cluster_id], a)
            for a in assignments.values()
            if a.primary_vertical == vid and a.cluster_id in cluster_by_id
        ]
        result = _process_vertical(
            vcfg,
            cands,
            run=run,
            settings=settings,
            ranking_cfg=ranking_cfg,
            authority_map=authority_map,
            llm=llm,
            writer_llm=writer_llm,
            errors=errors,
            candidates_debug=candidates_debug,
            notes=notes,
            storage=(
                storage
                if (settings.generate_illustrations and not is_mock)
                else None
            ),
        )
        vertical_results[vid] = result
        log.info("[rank] %s selected: %d", vid, len(result.stories))

    # ── STATS + DEBUG + SAVE ─────────────────────────────────────────
    total_selected = sum(len(v.stories) for v in vertical_results.values())
    run.verticals = vertical_results
    run.finished_at = datetime.now(timezone.utc)
    run.stats = RunStats(
        articles_collected=len(all_articles),
        articles_by_collector=by_collector,
        articles_after_dedupe=len(kept),
        duplicates_removed=len(removals),
        story_clusters=len(clusters),
        clusters_classified=len(assignments),
        clusters_discarded=discarded,
        stories_selected=total_selected,
        llm_calls=llm.total_calls,
        estimated_input_tokens=llm.total_input_tokens,
        estimated_output_tokens=llm.total_output_tokens,
        token_usage_source="estimate" if is_mock else "api",
        estimated_llm_cost_usd=llm.estimated_cost_usd(),
        estimated_image_cost_usd=round(
            sum(
                a.estimated_cost_usd or 0.0
                for v in vertical_results.values()
                for s_ in v.stories
                for a in s_.slide_media
            ),
            4,
        )
        or None,
        illustrations_generated=sum(
            len(s_.slide_media) for v in vertical_results.values() for s_ in v.stories
        ),
        duration_seconds=round(time.monotonic() - started, 1),
        errors=errors,
    )
    pool_ids = {c.cluster_id for c in pool}
    run.debug = DebugReport(
        articles=articles,
        dedup_removals=removals,
        clusters=[
            ClusterDebug(
                cluster_id=c.cluster_id,
                canonical_title=c.canonical_title,
                size=c.source_count,
                domains=c.domains,
                languages=c.language_distribution,
                queries=sorted({a.original_query for a in c.articles if a.original_query})[:6],
                trend_score=t.score,
                trend_signals=t.signals,
                article_titles=[a.title for a in c.articles],
                sent_to_classification=c.cluster_id in pool_ids,
            )
            for c, t in sorted(scored, key=lambda ct: ct[1].score, reverse=True)
        ],
        classifications=list(assignments.values()),
        unclassified_cluster_ids=skipped_ids,
        candidates=candidates_debug,
        llm_log=llm.calls,
        notes=notes,
    )

    log.info(
        "[llm] calls: %d | input tokens: %d | output tokens: %d | custo estimado: %s",
        llm.total_calls,
        llm.total_input_tokens,
        llm.total_output_tokens,
        f"US$ {run.stats.estimated_llm_cost_usd:.4f}" if run.stats.estimated_llm_cost_usd else "n/d",
    )
    path = repo.save_run(run)
    log.info("[output] %s escrito (e data/latest.json atualizado)", path)
    if errors:
        log.warning("[run] finalizado com %d aviso(s)/erro(s) não-fatais", len(errors))
    return run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="News Engine — pipeline diário")
    parser.add_argument("--mock", action="store_true", help="fixtures + LLM simulado (custo zero)")
    parser.add_argument("--live", action="store_true", help="força modo live (ignora PIPELINE_MODE)")
    parser.add_argument("--lookback", type=int, default=None, help="janela em horas (default: env)")
    parser.add_argument("--fixtures", default=None, help="caminho alternativo de fixtures (mock)")
    args = parser.parse_args(argv)

    settings = Settings()
    if args.lookback:
        settings.news_lookback_hours = args.lookback

    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(message)s",
        datefmt="%H:%M:%S",
    )
    # 1 linha por request HTTP polui o log do run; warnings continuam visíveis
    logging.getLogger("httpx").setLevel(logging.WARNING)

    mock: bool | None = None
    if args.mock:
        mock = True
    elif args.live:
        mock = False

    try:
        run = run_pipeline(settings, mock=mock, fixture_path=args.fixtures)
    except (PipelineError, ClassificationError, LLMError) as e:
        log.error("[run] FALHA CRÍTICA: %s", e)
        return 1

    for vid, result in run.verticals.items():
        flag = " (insuficiente)" if result.insufficient_quality_candidates else ""
        log.info("[resultado] %s: %d stories%s", vid, len(result.stories), flag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
