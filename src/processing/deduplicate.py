"""Deduplicação local (sem LLM).

Remove:
  1. URLs/canonical idênticas;
  2. quase-duplicatas do mesmo veículo (fuzzy título);
  3. syndication evidente entre veículos (título praticamente idêntico).

Importante: artigos de veículos DIFERENTES sobre o mesmo acontecimento com
títulos distintos NÃO são duplicatas — viram um StoryCluster no passo seguinte.
"""

from __future__ import annotations

from collections import defaultdict

from rapidfuzz import fuzz

from src.models import Article, DedupRemoval

SAME_DOMAIN_THRESHOLD = 92.0
CROSS_DOMAIN_THRESHOLD = 96.0


def _removal(dup: Article, kept: Article, reason: str, similarity: float | None = None) -> DedupRemoval:
    return DedupRemoval(
        article_id=dup.article_id,
        title=dup.title,
        url=dup.url,
        source_domain=dup.source_domain,
        reason=reason,
        kept_article_id=kept.article_id,
        similarity=round(similarity, 1) if similarity is not None else None,
    )


def deduplicate(
    articles: list[Article],
    *,
    same_domain_threshold: float = SAME_DOMAIN_THRESHOLD,
    cross_domain_threshold: float = CROSS_DOMAIN_THRESHOLD,
) -> tuple[list[Article], list[DedupRemoval]]:
    # ordena por (autoridade desc, mais antigo primeiro): o "mantido" é sempre
    # a melhor fonte; o mais antigo preserva o horário real do furo
    ordered = sorted(articles, key=lambda a: (-a.authority_score, a.published_at))
    removals: list[DedupRemoval] = []

    # 1) URLs idênticas (url ou canonical)
    seen_urls: dict[str, Article] = {}
    stage1: list[Article] = []
    for a in ordered:
        keys = {a.canonical_url or a.url, a.url}
        hit = next((seen_urls[k] for k in keys if k in seen_urls), None)
        if hit is not None:
            removals.append(_removal(a, hit, "url_duplicada"))
            continue
        for k in keys:
            seen_urls[k] = a
        stage1.append(a)

    # 2) título idêntico (chave normalizada) — mesmo domínio OU syndication
    seen_titles: dict[str, Article] = {}
    stage2: list[Article] = []
    for a in stage1:
        key = a.normalized_title
        hit = seen_titles.get(key)
        if hit is not None:
            reason = (
                "titulo_repetido_mesmo_veiculo"
                if hit.source_domain == a.source_domain
                else "syndication_titulo_identico"
            )
            removals.append(_removal(a, hit, reason, 100.0))
            continue
        seen_titles[key] = a
        stage2.append(a)

    # 3) fuzzy dentro do mesmo domínio (updates/republicações do mesmo veículo)
    by_domain: dict[str, list[Article]] = defaultdict(list)
    stage3: list[Article] = []
    for a in stage2:
        dupe_of: Article | None = None
        best = 0.0
        for other in by_domain[a.source_domain]:
            score = fuzz.token_set_ratio(a.normalized_title, other.normalized_title)
            if score >= same_domain_threshold and score > best:
                dupe_of, best = other, score
        if dupe_of is not None:
            removals.append(_removal(a, dupe_of, "quase_duplicata_mesmo_veiculo", best))
            continue
        by_domain[a.source_domain].append(a)
        stage3.append(a)

    # 4) syndication fuzzy entre domínios (títulos praticamente idênticos)
    kept: list[Article] = []
    for a in stage3:
        dupe_of = None
        best = 0.0
        for other in kept:
            if other.source_domain == a.source_domain:
                continue
            if abs(len(other.normalized_title) - len(a.normalized_title)) > 25:
                continue
            score = fuzz.ratio(a.normalized_title, other.normalized_title)
            if score >= cross_domain_threshold and score > best:
                dupe_of, best = other, score
        if dupe_of is not None:
            removals.append(_removal(a, dupe_of, "syndication_evidente", best))
            continue
        kept.append(a)

    return kept, removals
