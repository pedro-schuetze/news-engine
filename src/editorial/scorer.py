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
) -> tuple[dict[str, EditorialItem], list[str]]:
    """Retorna (cluster_id -> EditorialItem, erros). Falha aqui não derruba o run."""
    if not candidates:
        return {}, []

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
    return scores, errors
