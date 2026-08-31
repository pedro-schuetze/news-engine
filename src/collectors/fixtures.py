"""Collector de fixtures (PIPELINE_MODE=mock, testes e CI).

Lê tests/fixtures/articles.json — cada item usa `published_hours_ago` em vez
de data absoluta, então o run mockado se comporta como "notícias de hoje"
para sempre (recência/janela funcionam de verdade).
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from pathlib import Path

from src.collectors.base import Collector
from src.models import Article

log = logging.getLogger("news_engine.collect")

DEFAULT_FIXTURE_PATH = Path("tests/fixtures/articles.json")


class FixtureCollector(Collector):
    name = "fixture"

    def __init__(self, path: str | Path = DEFAULT_FIXTURE_PATH, **kwargs):
        super().__init__(**kwargs)
        self.path = Path(path)

    def collect(self) -> list[Article]:
        if not self.path.exists():
            log.warning("[collect] fixtures não encontradas em %s", self.path)
            return []
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        articles: list[Article] = []
        for item in raw:
            hours_ago = float(item.get("published_hours_ago", 1))
            if hours_ago > self.lookback_hours:
                continue  # fora da janela — igual aos collectors reais
            articles.append(
                Article(
                    title=item["title"],
                    description=item.get("description", ""),
                    url=item["url"],
                    source_name=item.get("source_name", ""),
                    source_domain=item.get("source_domain", ""),
                    published_at=self.now - timedelta(hours=hours_ago),
                    collected_at=self.now,
                    original_query=item.get("query", "fixture"),
                    collector="fixture",
                    language=item.get("language", "pt"),
                    possible_vertical=item.get("possible_vertical"),
                    authority_score=item.get("authority_score", 50),
                )
            )
        return articles
