from datetime import timedelta

from src.config import ClusterParams
from src.processing.cluster import build_clusters, salient_tokens
from tests.conftest import NOW, make_article, normalized

PARAMS = ClusterParams()


def test_same_event_clusters_together():
    arts = normalized(
        make_article(
            title="TSE aprova resolução que endurece regras para propaganda eleitoral em 2026",
            url="https://agenciabrasil.ebc.com.br/1",
            source_domain="agenciabrasil.ebc.com.br",
            authority_score=88,
        ),
        make_article(
            title="TSE endurece regras de propaganda eleitoral e uso de IA para eleições de 2026",
            url="https://g1.globo.com/1",
            source_domain="g1.globo.com",
            authority_score=85,
        ),
        make_article(
            title="Novas regras do TSE para propaganda em 2026: o que muda na prática",
            url="https://poder360.com.br/1",
            source_domain="poder360.com.br",
            authority_score=78,
        ),
    )
    clusters = build_clusters(arts, PARAMS)
    assert len(clusters) == 1
    c = clusters[0]
    assert c.source_count == 3
    assert c.unique_domain_count == 3
    # título canônico vem da fonte de maior autoridade
    assert c.canonical_title.startswith("TSE aprova resolução")


def test_similar_wording_different_events_stay_apart():
    arts = normalized(
        make_article(
            title="Lula viaja à Argentina para cúpula do Mercosul na próxima semana",
            url="https://a.com/1",
            source_domain="a.com",
        ),
        make_article(
            title="Lula viaja a Angola em visita oficial para acordos de cooperação",
            url="https://b.com/1",
            source_domain="b.com",
        ),
    )
    clusters = build_clusters(arts, PARAMS)
    assert len(clusters) == 2


def test_cluster_metadata():
    arts = normalized(
        make_article(
            title="Webb detecta atmosfera em exoplaneta rochoso",
            url="https://a.com/1",
            source_domain="a.com",
            language="pt",
            original_query="espaço",
            published_at=NOW - timedelta(hours=5),
            possible_vertical="facts",
        ),
        make_article(
            title="Webb detecta atmosfera em exoplaneta rochoso pela primeira vez",
            url="https://b.com/1",
            source_domain="b.com",
            language="en",
            original_query="space",
            published_at=NOW - timedelta(hours=3),
            possible_vertical="facts",
        ),
    )
    clusters = build_clusters(arts, PARAMS)
    assert len(clusters) == 1
    c = clusters[0]
    assert c.language_distribution == {"pt": 1, "en": 1}
    assert c.query_count == 2
    assert c.possible_verticals == {"facts": 2}
    assert c.earliest_published_at < c.latest_published_at


def test_rewritten_headlines_same_event_cluster():
    """Reescritas com entidade em posição inicial — o sinal s2 (palavras de
    conteúdo) precisa capturar; o sinal s1 sozinho não capturava."""
    pairs = [
        (
            "Netflix cancela série de sucesso após três temporadas e fãs reagem",
            "Netflix cancela série aclamada e anuncia temporada final para 2027",
        ),
        (
            "James Webb telescope finds strongest evidence yet of atmosphere on rocky exoplanet",
            "Webb detects possible atmosphere around rocky exoplanet for the first time",
        ),
        (
            "Indicados ao Oscar 2027 são anunciados; Brasil concorre em duas categorias",
            "Oscar 2027: veja a lista completa de indicados ao prêmio da Academia",
        ),
    ]
    for title_a, title_b in pairs:
        arts = normalized(
            make_article(title=title_a, url="https://a.com/1", source_domain="a.com"),
            make_article(title=title_b, url="https://b.com/1", source_domain="b.com"),
        )
        assert len(build_clusters(arts, PARAMS)) == 1, f"deveriam unir: {title_a[:40]}"


def test_same_theme_different_events_stay_apart():
    """Mesmo tema (eleições 2026) mas eventos diferentes não podem unir."""
    arts = normalized(
        make_article(
            title="TSE aprova resolução que endurece regras para propaganda eleitoral em 2026",
            url="https://a.com/1",
            source_domain="a.com",
        ),
        make_article(
            title="Pesquisa eleitoral mostra empate técnico na disputa presidencial de 2026",
            url="https://b.com/1",
            source_domain="b.com",
        ),
        make_article(
            title="Congresso aprova em segundo turno PEC que muda regras de emendas parlamentares",
            url="https://c.com/1",
            source_domain="c.com",
        ),
    )
    assert len(build_clusters(arts, PARAMS)) == 3


def test_salient_tokens_extracts_entities():
    tokens = salient_tokens("Lula viaja à Argentina para cúpula do Mercosul em 2026")
    assert "argentina" in tokens
    assert "mercosul" in tokens
    assert "2026" in tokens
    assert "viaja" not in tokens  # palavra comum minúscula não é entidade
