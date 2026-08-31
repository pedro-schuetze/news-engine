from src.processing.deduplicate import deduplicate
from tests.conftest import make_article, normalized


def test_identical_urls_keep_highest_authority():
    a = make_article(url="https://ex.com/x?utm_source=a", authority_score=50)
    b = make_article(url="https://ex.com/x", authority_score=80, source_domain="ex.com")
    kept, removals = deduplicate(normalized(a, b))
    assert len(kept) == 1
    assert kept[0].authority_score == 80
    assert removals[0].reason == "url_duplicada"


def test_same_title_same_domain_removed():
    a = make_article(title="TSE aprova novas regras", url="https://ex.com/1")
    b = make_article(title="TSE aprova novas regras!", url="https://ex.com/2")
    kept, removals = deduplicate(normalized(a, b))
    assert len(kept) == 1
    assert removals[0].reason == "titulo_repetido_mesmo_veiculo"


def test_syndication_identical_title_cross_domain():
    a = make_article(title="Governo anuncia pacote", url="https://a.com/1", source_domain="a.com", authority_score=85)
    b = make_article(title="Governo anuncia pacote", url="https://b.com/1", source_domain="b.com", authority_score=60)
    kept, removals = deduplicate(normalized(a, b))
    assert len(kept) == 1
    assert kept[0].source_domain == "a.com"
    assert removals[0].reason == "syndication_titulo_identico"


def test_fuzzy_near_duplicate_same_domain():
    a = make_article(title="Netflix cancela série de sucesso após três temporadas", url="https://ex.com/1")
    b = make_article(title="Netflix cancela série de sucesso após 3 temporadas", url="https://ex.com/2")
    kept, removals = deduplicate(normalized(a, b))
    assert len(kept) == 1
    assert removals[0].reason == "quase_duplicata_mesmo_veiculo"


def test_same_event_different_titles_cross_domain_are_kept():
    # NÃO é dedupe: vira cluster no passo seguinte
    a = make_article(title="TSE aprova resolução sobre propaganda", url="https://a.com/1", source_domain="a.com")
    b = make_article(title="Tribunal endurece regras de campanha para 2026", url="https://b.com/1", source_domain="b.com")
    kept, removals = deduplicate(normalized(a, b))
    assert len(kept) == 2
    assert removals == []


def test_different_stories_same_domain_kept():
    a = make_article(title="Lula viaja para a Argentina na sexta", url="https://ex.com/1")
    b = make_article(title="Congresso vota PEC das emendas na terça", url="https://ex.com/2")
    kept, _ = deduplicate(normalized(a, b))
    assert len(kept) == 2
