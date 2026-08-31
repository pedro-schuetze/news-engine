from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from src.models import Article
from src.processing.normalize import normalize_articles

# instante fixo para testes determinísticos
NOW = datetime(2026, 8, 30, 12, 0, 0, tzinfo=timezone.utc)


def make_article(**kwargs) -> Article:
    defaults = dict(
        title="Título de exemplo",
        description="",
        url="https://example.com/noticia",
        source_name="Example",
        source_domain="example.com",
        published_at=NOW - timedelta(hours=2),
        collected_at=NOW,
        original_query="query",
        collector="test",
        language="pt",
        authority_score=50,
    )
    defaults.update(kwargs)
    return Article(**defaults)


@pytest.fixture
def now() -> datetime:
    return NOW


@pytest.fixture
def article_factory():
    return make_article


def normalized(*articles: Article) -> list[Article]:
    return normalize_articles(list(articles))
