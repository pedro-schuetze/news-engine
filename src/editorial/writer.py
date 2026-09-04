"""Geração do pacote editorial (draft de Instagram) para stories selecionadas.

Uma chamada por story (qualidade importa aqui; são no máx. 5 por vertical).
Falha em uma story não interrompe as demais — a story fica sem draft e o
motivo vai para os erros do run.
"""

from __future__ import annotations

import logging

from src.config import VerticalConfig
from src.llm.base import LLMClient
from src.llm.prompts import SYSTEM_PROMPT, build_brief_prompt, build_draft_prompt
from src.models import BriefOutput, DraftOutput, EditorialDraft, Story, StoryCluster

log = logging.getLogger("news_engine.writer")


def write_brief(
    story: Story,
    cluster: StoryCluster,
    vertical: VerticalConfig,
    llm: LLMClient,
) -> EditorialDraft:
    """Manchete + resumo (draft MAGRO, slides vazios). Roda no modelo barato."""
    arts = sorted(cluster.articles, key=lambda a: -a.authority_score)[:6]
    sources = [
        (
            a.source_domain or a.source_name,
            a.title,
            a.description[:300],
            a.published_at.strftime("%Y-%m-%d %H:%M UTC"),
        )
        for a in arts
    ]
    verification_summary = (
        f"{story.verification.status.value}; "
        f"{story.verification.independent_source_count} fonte(s) independente(s); "
        f"fonte oficial: {'sim' if story.verification.has_primary_source else 'não'}"
    )
    content_type = story.content_type.value if story.content_type else "FACT"
    prompt = build_brief_prompt(
        vertical,
        title=story.title,
        content_type=content_type,
        verification_summary=verification_summary,
        sources=sources,
    )
    output = llm.generate(
        BriefOutput,
        system=SYSTEM_PROMPT,
        user=prompt,
        purpose=f"brief/{vertical.id}",
    )
    return output.to_draft(story.story_id)


def write_draft(
    story: Story,
    cluster: StoryCluster,
    vertical: VerticalConfig,
    llm: LLMClient,
) -> EditorialDraft:
    """Gera o draft. Propaga LLMValidationError para o chamador decidir."""
    arts = sorted(cluster.articles, key=lambda a: -a.authority_score)[:6]
    sources = [
        (
            a.source_domain or a.source_name,
            a.title,
            a.description[:300],
            a.published_at.strftime("%Y-%m-%d %H:%M UTC"),
        )
        for a in arts
    ]
    verification_summary = (
        f"{story.verification.status.value}; "
        f"{story.verification.independent_source_count} fonte(s) independente(s); "
        f"fonte oficial: {'sim' if story.verification.has_primary_source else 'não'}"
    )
    content_type = story.content_type.value if story.content_type else "FACT"

    prompt = build_draft_prompt(
        vertical,
        title=story.title,
        content_type=content_type,
        verification_summary=verification_summary,
        sources=sources,
    )
    output = llm.generate(
        DraftOutput,
        system=SYSTEM_PROMPT,
        user=prompt,
        purpose=f"draft/{vertical.id}",
    )
    return output.to_draft(story.story_id)
