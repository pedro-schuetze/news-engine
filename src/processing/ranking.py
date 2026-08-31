"""Trend Score determinístico + composição do score final + seleção.

Fórmulas explícitas e testáveis; todos os pesos vêm de config/ranking.yaml.
O LLM nunca decide o ranking final sozinho: ele fornece o editorial_score,
que é combinado aqui com o trend_score de forma determinística.
"""

from __future__ import annotations

import math
from datetime import datetime

from rapidfuzz import fuzz

from src.config import RankingConfig, VerificationRules
from src.models import Story, StoryCluster, TrendScore, VerificationStatus
from src.processing.normalize import title_key


def compute_trend_score(
    cluster: StoryCluster,
    cfg: RankingConfig,
    authority_map: dict[str, int],
    now: datetime,
    previous_titles: list[str],
) -> TrendScore:
    t = cfg.trend

    # diversidade de fontes: nº de domínios únicos, saturando em diversity_cap
    diversity = min(cluster.unique_domain_count, t.diversity_cap) / t.diversity_cap

    # recência: decaimento exponencial da última publicação do cluster
    latest = cluster.latest_published_at or now
    age_hours = max(0.0, (now - latest).total_seconds() / 3600)
    recency = math.exp(-age_hours * math.log(2) / t.recency_half_life_hours)

    # velocidade: artigos adicionais por hora dentro da janela do cluster
    earliest = cluster.earliest_published_at or latest
    span_hours = max(0.5, (latest - earliest).total_seconds() / 3600)
    rate = (cluster.source_count - 1) / span_hours
    velocity = min(1.0, rate / t.velocity_norm_per_hour)

    # autoridade: média das 3 maiores autoridades de domínio do cluster
    authorities = sorted(
        (authority_map.get(d, t.authority_default) for d in cluster.domains), reverse=True
    ) or [t.authority_default]
    authority = (sum(authorities[:3]) / len(authorities[:3])) / 100.0

    # espalhamento de queries: quantas buscas distintas acharam o evento
    query_spread = min(cluster.query_count, 3) / 3.0

    # novidade: penaliza eventos muito parecidos com stories de runs anteriores
    if previous_titles:
        key = title_key(cluster.canonical_title)
        best_sim = max(
            (fuzz.token_set_ratio(key, title_key(prev)) for prev in previous_titles),
            default=0.0,
        )
        novelty = max(0.0, min(1.0, 1.0 - (best_sim - 60.0) / 40.0))
    else:
        novelty = t.novelty_neutral

    signals = {
        "source_diversity": round(diversity, 4),
        "recency": round(recency, 4),
        "velocity": round(velocity, 4),
        "authority": round(authority, 4),
        "query_spread": round(query_spread, 4),
        "novelty": round(novelty, 4),
    }
    score = 100.0 * sum(t.weights.get(name, 0.0) * value for name, value in signals.items())
    return TrendScore(score=round(score, 2), signals=signals)


def verification_adjustment(
    status: VerificationStatus, rules: VerificationRules
) -> tuple[float, bool, str]:
    """(penalidade, excluir_da_selecao, nota)."""
    if status == VerificationStatus.UNVERIFIED:
        if rules.unverified_action == "exclude":
            return 0.0, True, "excluída da seleção: UNVERIFIED nesta vertical"
        return rules.unverified_penalty, False, (
            f"-{rules.unverified_penalty:g} no score final por UNVERIFIED"
        )
    if status == VerificationStatus.PARTIALLY_VERIFIED:
        return rules.partially_verified_penalty, False, (
            f"-{rules.partially_verified_penalty:g} no score final por PARTIALLY_VERIFIED"
        )
    return 0.0, False, ""


def compute_final_score(
    vertical: str,
    trend_score: float,
    editorial_score: int,
    verification_status: VerificationStatus,
    cfg: RankingConfig,
) -> tuple[float, bool, list[str]]:
    """final = blend(trend, editorial) - penalidade de verificação.

    Retorna (score, excluida_da_selecao, notas_da_formula).
    """
    blend = cfg.final_blend(vertical)
    total = blend.trend + blend.editorial
    w_trend = blend.trend / total
    w_edit = blend.editorial / total
    base = w_trend * trend_score + w_edit * editorial_score

    rules = cfg.verification_rules(vertical)
    penalty, excluded, note = verification_adjustment(verification_status, rules)
    final = max(0.0, min(100.0, base - penalty))

    notes = [f"final = {w_trend:.2f}*trend({trend_score:.1f}) + {w_edit:.2f}*editorial({editorial_score})"]
    if note:
        notes.append(note)
    return round(final, 2), excluded, notes


def select_stories(
    candidates: list[Story], min_n: int, max_n: int, min_final_score: float
) -> tuple[list[Story], bool, list[str]]:
    """Seleciona até max_n stories acima do threshold; nunca preenche quota com ruim.

    Retorna (selecionadas, insufficient_quality_candidates, log_de_decisões).
    """
    decisions: list[str] = []
    ordered = sorted(candidates, key=lambda s: s.final_score, reverse=True)
    selected: list[Story] = []
    for story in ordered:
        if len(selected) >= max_n:
            decisions.append(f"NÃO selecionada (quota cheia): {story.title} [{story.final_score:.1f}]")
            continue
        if story.final_score < min_final_score:
            decisions.append(
                f"NÃO selecionada (abaixo do threshold {min_final_score:g}): "
                f"{story.title} [{story.final_score:.1f}]"
            )
            continue
        selected.append(story)
        decisions.append(f"SELECIONADA #{len(selected)}: {story.title} [{story.final_score:.1f}]")
    for rank, story in enumerate(selected, start=1):
        story.selection_rank = rank
    insufficient = len(selected) < min_n
    return selected, insufficient, decisions
