"""Agrupamento de artigos em StoryClusters (mesmo acontecimento).

Estratégia local, sem LLM. A similaridade de um par é o MÁXIMO de dois sinais:

  s1 = title_weight * token_set_ratio(títulos normalizados)
     + entity_weight * 100 * jaccard(entidades salientes)
  s2 = token_set_ratio(apenas palavras de conteúdo, sem stopwords pt/en)

similaridade = max(s1, s2)   [calibrado com pares rotulados; ver tests/]

s1 captura manchetes com muitas entidades em comum; s2 captura reescritas do
mesmo evento em que as entidades ficam em posição inicial ("Netflix cancela…"
vs "Netflix cancela…") — stopwords diluem o ratio completo nesses casos.

"Entidades salientes" = palavras capitalizadas fora de início de frase,
siglas e números — aproximação barata de NER que ajuda a unir manchetes
com fraseados diferentes sobre o mesmo evento (e a separar eventos
diferentes com fraseado parecido).

Limitação conhecida (documentada): matérias em idiomas diferentes sobre o
mesmo evento raramente atingem o threshold — podem virar dois clusters. O
Editorial Router recebe instrução para descartar duplicatas semânticas; a
solução definitiva (embeddings multilíngues) fica para uma fase futura.
"""

from __future__ import annotations

import re
from collections import Counter

from rapidfuzz import fuzz

from src.config import ClusterParams
from src.models import Article, StoryCluster

_WORD_RE = re.compile(r"\w+", re.UNICODE)

# palavras capitalizadas comuns que não são entidades (pt/en)
_CAP_STOPWORDS = {
    "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "em", "no", "na",
    "por", "para", "com", "sem", "the", "a", "an", "in", "on", "of", "to", "and", "for",
    "após", "apos", "antes", "durante", "segundo", "veja", "como", "por que", "porque",
    "new", "how", "why", "what", "when",
}

# stopwords para o sinal s2 (ratio de palavras de conteúdo)
_CONTENT_STOPWORDS = frozenset(
    """a o e os as um uma de do da dos das em no na nos nas por para com sem sobre que
    apos após antes entre ate até seu sua seus suas ao aos à às lista veja como mais
    menos ja já ser é são foi tem vai vao vão nesta neste essa esse isto isso pela pelo
    the an of to in on for and with from by at is are was were be been this that after
    before between says say said new its his her their our
    """.split()
)


def content_key(normalized_title: str) -> str:
    """Chave só com palavras de conteúdo (para o sinal s2)."""
    return " ".join(w for w in normalized_title.split() if w not in _CONTENT_STOPWORDS)


def salient_tokens(title: str) -> set[str]:
    tokens = _WORD_RE.findall(title)
    out: set[str] = set()
    for i, tok in enumerate(tokens):
        low = tok.lower()
        if tok.isdigit() and len(tok) >= 2:
            out.add(low)
        elif tok.isupper() and len(tok) >= 2:  # siglas: TSE, STF, NASA
            out.add(low)
        elif tok[0].isupper() and i > 0 and low not in _CAP_STOPWORDS and len(tok) >= 3:
            out.add(low)
    return out


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def pair_similarity(
    key_a: str, ents_a: set[str], key_b: str, ents_b: set[str], params: ClusterParams
) -> float:
    s1 = (
        params.title_weight * fuzz.token_set_ratio(key_a, key_b)
        + params.entity_weight * 100.0 * _jaccard(ents_a, ents_b)
    )
    s2 = fuzz.token_set_ratio(content_key(key_a), content_key(key_b))
    return max(s1, s2)


def build_clusters(articles: list[Article], params: ClusterParams) -> list[StoryCluster]:
    """Clustering greedy de passada única, do artigo mais antigo ao mais novo."""
    ordered = sorted(articles, key=lambda a: a.published_at)

    # cada cluster: lista de (article, title_key, entidades)
    raw_clusters: list[list[tuple[Article, str, set[str]]]] = []
    for art in ordered:
        key = art.normalized_title
        ents = salient_tokens(art.title)
        best_cluster: list | None = None
        best_score = 0.0
        for cluster in raw_clusters:
            members = cluster[-params.max_members_compared :]
            score = max(
                pair_similarity(key, ents, m_key, m_ents, params)
                for _, m_key, m_ents in members
            )
            if score >= params.similarity_threshold and score > best_score:
                best_cluster, best_score = cluster, score
        if best_cluster is not None:
            best_cluster.append((art, key, ents))
        else:
            raw_clusters.append([(art, key, ents)])

    return [_finalize([m[0] for m in cluster]) for cluster in raw_clusters]


def _finalize(members: list[Article]) -> StoryCluster:
    # título canônico: a fonte de maior autoridade; empate -> a mais antiga
    canonical = sorted(members, key=lambda a: (-a.authority_score, a.published_at))[0]
    domains = sorted({a.source_domain for a in members if a.source_domain})
    langs = Counter(a.language for a in members if a.language)
    hints = Counter(a.possible_vertical for a in members if a.possible_vertical)
    queries = {a.original_query for a in members if a.original_query}
    return StoryCluster(
        canonical_title=canonical.title,
        articles=members,
        source_count=len(members),
        unique_domain_count=len(domains),
        domains=domains,
        earliest_published_at=min(a.published_at for a in members),
        latest_published_at=max(a.published_at for a in members),
        language_distribution=dict(langs),
        possible_verticals=dict(hints),
        query_count=len(queries),
    )
