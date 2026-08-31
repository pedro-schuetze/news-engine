"""Editorial Router: decide a vertical (ou descarte) de cada StoryCluster.

Controle de custo em duas etapas:
  1. pré-seleção LOCAL (grátis): só os melhores clusters por trend score vão
     para o LLM — pool por hint de vertical + pool aberto;
  2. classificação em BATCH: N clusters por chamada, nunca 1 chamada/cluster.

Comportamento por vertical é definido em config/verticals.yaml — o router
não conhece verticais específicas (adicionar vertical não muda este código).
"""

from __future__ import annotations

import logging

from src.config import LLMBudget, VerticalConfig
from src.llm.base import LLMClient, LLMValidationError
from src.llm.prompts import SYSTEM_PROMPT, ClusterView, build_classification_prompt
from src.models import (
    DISCARD,
    ClassificationBatch,
    StoryCluster,
    TrendScore,
    VerticalAssignment,
)

log = logging.getLogger("news_engine.router")


class ClassificationError(Exception):
    """Nenhum batch de classificação retornou — etapa crítica falhou."""


def dominant_hint(cluster: StoryCluster) -> str | None:
    if not cluster.possible_verticals:
        return None
    return max(cluster.possible_verticals.items(), key=lambda kv: kv[1])[0]


def build_view(index: int, cluster: StoryCluster, *, with_description: bool = False) -> ClusterView:
    arts = sorted(cluster.articles, key=lambda a: -a.authority_score)[:3]
    top_sources = [
        (
            a.source_domain or a.source_name,
            a.title,
            (a.description[:220] if with_description else ""),
            a.published_at.strftime("%Y-%m-%d %H:%M UTC"),
        )
        for a in arts
    ]
    return ClusterView(
        index=index,
        cluster_id=cluster.cluster_id,
        title=cluster.canonical_title,
        hint=dominant_hint(cluster) or "",
        domains=cluster.domains,
        languages=cluster.language_distribution,
        query_count=cluster.query_count,
        top_sources=top_sources,
    )


def pick_classification_pool(
    scored: list[tuple[StoryCluster, TrendScore]],
    verticals: dict[str, VerticalConfig],
    budget: LLMBudget,
) -> tuple[list[StoryCluster], list[str]]:
    """Seleciona quem merece gastar LLM. Retorna (pool, ids_não_classificados)."""
    by_trend = sorted(scored, key=lambda ct: ct[1].score, reverse=True)
    chosen: dict[str, StoryCluster] = {}

    # pool por hint: garante espaço para cada vertical (FACTS não pode ser
    # atropelada por volume de política/entretenimento trending)
    for vertical_id in verticals:
        count = 0
        for cluster, _trend in by_trend:
            if count >= budget.per_vertical_hint_pool:
                break
            if cluster.cluster_id in chosen:
                continue
            if dominant_hint(cluster) == vertical_id:
                chosen[cluster.cluster_id] = cluster
                count += 1

    # pool aberto: os melhores restantes por trend, com ou sem hint
    count = 0
    for cluster, _trend in by_trend:
        if count >= budget.open_pool or len(chosen) >= budget.max_clusters_to_classify:
            break
        if cluster.cluster_id not in chosen:
            chosen[cluster.cluster_id] = cluster
            count += 1

    pool = list(chosen.values())[: budget.max_clusters_to_classify]
    pool_ids = {c.cluster_id for c in pool}
    skipped = [c.cluster_id for c, _ in scored if c.cluster_id not in pool_ids]
    return pool, skipped


def classify_clusters(
    pool: list[StoryCluster],
    llm: LLMClient,
    verticals: dict[str, VerticalConfig],
    budget: LLMBudget,
) -> tuple[dict[str, VerticalAssignment], list[str]]:
    """Classifica em batches. Retorna (cluster_id -> assignment, erros)."""
    assignments: dict[str, VerticalAssignment] = {}
    errors: list[str] = []
    valid_ids = set(verticals.keys()) | {DISCARD}
    any_batch_ok = False

    batches = [
        pool[i : i + budget.classification_batch_size]
        for i in range(0, len(pool), budget.classification_batch_size)
    ]
    for batch_num, batch in enumerate(batches, start=1):
        views = [build_view(i, c) for i, c in enumerate(batch)]
        pending = {v.index: batch[v.index] for v in views}

        for round_ in (1, 2):  # 2ª rodada só para índices que faltaram
            if not pending:
                break
            round_views = [v for v in views if v.index in pending]
            prompt = build_classification_prompt(round_views, verticals)
            try:
                result = llm.generate(
                    ClassificationBatch,
                    system=SYSTEM_PROMPT,
                    user=prompt,
                    purpose=f"classification/batch{batch_num}",
                )
            except LLMValidationError as e:
                errors.append(f"classificação batch {batch_num} (rodada {round_}): {e}")
                break
            any_batch_ok = True
            for item in result.classifications:
                cluster = pending.pop(item.index, None)
                if cluster is None:
                    continue  # índice inventado/duplicado — ignora
                primary = item.primary_vertical
                reason = item.reason
                if primary not in valid_ids:
                    reason = f"vertical desconhecida '{primary}' — descartada. {reason}"
                    primary = DISCARD
                if item.duplicate_of_index is not None and primary != DISCARD:
                    dup_of = batch[item.duplicate_of_index].canonical_title if (
                        0 <= item.duplicate_of_index < len(batch)
                    ) else "outro item"
                    primary = DISCARD
                    reason = f"duplicata semântica de: {dup_of}. {reason}"
                assignments[cluster.cluster_id] = VerticalAssignment(
                    cluster_id=cluster.cluster_id,
                    primary_vertical=primary,
                    vertical_scores=item.vertical_scores,
                    classification_confidence=item.confidence,
                    classification_reason=reason,
                    content_type=item.content_type,
                    assigned_by="llm",
                )

        # o que sobrou vira descarte explícito e auditável
        for cluster in pending.values():
            assignments[cluster.cluster_id] = VerticalAssignment(
                cluster_id=cluster.cluster_id,
                primary_vertical=DISCARD,
                classification_reason="sem classificação do LLM após retries",
                assigned_by="fallback",
            )

    if pool and not any_batch_ok:
        raise ClassificationError(
            "todas as chamadas de classificação falharam — abortando o run; erros: "
            + "; ".join(errors[-3:])
        )
    return assignments, errors
