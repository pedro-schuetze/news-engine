"""Verificação de stories.

Parte determinística (grátis): contagem de fontes independentes, detecção de
fonte oficial/primária por domínio e regras por vertical (POLITICS é mais
rigorosa — config/ranking.yaml).

Parte LLM: sinais qualitativos (rumor/alegação, contradições, notas) chegam
"de carona" na chamada de score editorial (EditorialItem) e são mesclados
aqui — decisão deliberada para economizar chamadas (docs/architecture).
"""

from __future__ import annotations

from src.config import VerificationRules, VerticalConfig
from src.models import (
    EditorialItem,
    SourceRef,
    StoryCluster,
    Verification,
    VerificationStatus,
)


def is_official_domain(domain: str, official_domains: list[str]) -> bool:
    domain = domain.lower()
    for entry in official_domains:
        entry = entry.lower().lstrip(".")
        if domain == entry or domain.endswith("." + entry):
            return True
    return False


def _source_type(domain: str, authority: int, official_domains: list[str]) -> str:
    if is_official_domain(domain, official_domains):
        return "official"
    if authority >= 85:
        return "agency_or_major"
    return "media"


def build_verification(
    cluster: StoryCluster,
    vertical_cfg: VerticalConfig,
    rules: VerificationRules,
    authority_map: dict[str, int],
    llm_item: EditorialItem | None = None,
    max_supporting: int = 8,
) -> Verification:
    refs: list[SourceRef] = []
    for art in cluster.articles:
        authority = authority_map.get(art.source_domain, art.authority_score)
        refs.append(
            SourceRef(
                article_id=art.article_id,
                name=art.source_name or art.source_domain,
                url=art.url,
                source_domain=art.source_domain,
                published_at=art.published_at,
                source_type=_source_type(art.source_domain, authority, vertical_cfg.official_domains),
                authority_score=authority,
            )
        )

    # primária: oficial primeiro; senão, a de maior autoridade
    refs_sorted = sorted(
        refs, key=lambda r: (r.source_type != "official", -r.authority_score)
    )
    primary = refs_sorted[0] if refs_sorted else None
    supporting = refs_sorted[1 : 1 + max_supporting]

    independent = cluster.unique_domain_count
    has_official = any(r.source_type == "official" for r in refs)
    top_authority = max((r.authority_score for r in refs), default=0)

    if independent >= rules.verified_min_independent or (
        rules.official_counts_as_verified and has_official
    ):
        status = VerificationStatus.VERIFIED
    elif independent >= 1 and (
        top_authority >= rules.single_source_authority_min or has_official
    ):
        status = VerificationStatus.PARTIALLY_VERIFIED
    else:
        status = VerificationStatus.UNVERIFIED

    notes = [
        f"{independent} domínio(s) independente(s), {cluster.source_count} matéria(s); "
        f"fonte oficial: {'sim' if has_official else 'não'}; "
        f"autoridade máx.: {top_authority}."
    ]
    contradictions: list[str] = []
    if llm_item is not None:
        if llm_item.verification_notes:
            notes.append(f"LLM: {llm_item.verification_notes}")
        contradictions = list(llm_item.contradictions)
        if llm_item.is_rumor_or_claim:
            notes.append(
                "Conteúdo é alegação/rumor"
                + (f" ({llm_item.claim_attribution})" if llm_item.claim_attribution else "")
                + " — exige atribuição explícita no texto."
            )

    return Verification(
        status=status,
        supporting_source_count=cluster.source_count,
        independent_source_count=independent,
        has_primary_source=has_official,
        primary_source=primary,
        supporting_sources=supporting,
        contradictions_found=contradictions,
        verification_notes=" ".join(notes),
    )
