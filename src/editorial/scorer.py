"""Score editorial por vertical (LLM, em batch).

Cada vertical tem critérios próprios (config/verticals.yaml). A mesma
chamada aproveita para colher sinais de verificação qualitativos
(rumor/alegação, contradições, notas) — ver processing/verify.py.
"""

from __future__ import annotations

import logging

from src.config import LLMBudget, VerticalConfig
from src.editorial.router import build_view
from src.llm.base import LLMClient, LLMValidationError
from src.llm.prompts import SYSTEM_PROMPT, build_editorial_prompt
from src.models import EditorialBatch, EditorialItem, StoryCluster, TrendScore

log = logging.getLogger("news_engine.scorer")


def score_vertical_candidates(
    vertical: VerticalConfig,
    candidates: list[tuple[StoryCluster, TrendScore]],
    llm: LLMClient,
    budget: LLMBudget,
) -> tuple[dict[str, EditorialItem], dict[str, str], list[str]]:
    """Avalia os top candidatos da vertical em UMA chamada.

    Retorna (cluster_id -> EditorialItem, duplicatas_derrubadas, erros), onde
    duplicatas_derrubadas mapeia cluster_id -> cluster_id do item mantido —
    o LLM vê todos os candidatos juntos e marca acontecimentos repetidos que
    o clustering lexical não uniu (duplicate_of_index).
    Falha aqui não derruba o run.
    """
    if not candidates:
        return {}, {}, []

    top = sorted(candidates, key=lambda ct: ct[1].score, reverse=True)
    top = top[: budget.editorial_candidates_per_vertical]

    views = [build_view(i, c, with_description=True) for i, (c, _t) in enumerate(top)]
    pending = {i: top[i][0] for i in range(len(top))}
    scores: dict[str, EditorialItem] = {}
    errors: list[str] = []

    for round_ in (1, 2):
        if not pending:
            break
        round_views = [v for v in views if v.index in pending]
        prompt = build_editorial_prompt(vertical, round_views)
        try:
            result = llm.generate(
                EditorialBatch,
                system=SYSTEM_PROMPT,
                user=prompt,
                purpose=f"editorial_score/{vertical.id}",
            )
        except LLMValidationError as e:
            errors.append(f"score editorial {vertical.id} (rodada {round_}): {e}")
            break
        for item in result.items:
            cluster = pending.pop(item.index, None)
            if cluster is None:
                continue
            scores[cluster.cluster_id] = item

    for cluster in pending.values():
        errors.append(
            f"{vertical.id}: '{cluster.canonical_title}' ficou sem score editorial (LLM)"
        )

    # aplica duplicate_of_index: derruba o marcado, mantém o apontado
    dropped: dict[str, str] = {}
    index_to_cluster = {i: cluster for i, (cluster, _t) in enumerate(top)}
    for cluster_id, item in list(scores.items()):
        if item.duplicate_of_index is None:
            continue
        target = index_to_cluster.get(item.duplicate_of_index)
        if target is None or target.cluster_id == cluster_id:
            continue  # índice inválido ou auto-referência: ignora a marcação
        dropped[cluster_id] = target.cluster_id
        scores.pop(cluster_id)
    return scores, dropped, errors
