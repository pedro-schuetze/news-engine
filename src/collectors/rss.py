"""Collector de feeds RSS curados (config/sources.yaml).

Adicionar/remover fonte = editar YAML, sem tocar em código. Cada fonte
carrega categoria, autoridade, idioma e um vertical_hint opcional.
"""

from __future__ import annotations

import logging
from datetime import datetime

import feedparser

from src.collectors.base import Collector, CollectorFetchError, http_get
from src.config import SourceConfig
from src.models import Article
from src.processing.normalize import domain_of, strip_html, struct_time_to_datetime

log = logging.getLogger("news_engine.collect")

# categoria da fonte -> vertical sugerida (hint, não decisão final)
CATEGORY_TO_VERTICAL = {
    "entertainment": "entertainment",
    "politics": "politics",
    "science": "facts",
    "technology": "facts",
}

MAX_ENTRIES_PER_FEED = 40


def parse_rss_feed(
    content: bytes,
    source: SourceConfig,
    *,
    window_start: datetime,
    collected_at: datetime,
) -> list[Article]:
    feed = feedparser.parse(content)
    hint = source.vertical_hint or CATEGORY_TO_VERTICAL.get(source.category)
    articles: list[Article] = []
    for entry in feed.entries:
        published = struct_time_to_datetime(
            entry.get("published_parsed") or entry.get("updated_parsed")
        )
        if published is not None and (published < window_start or published > collected_at):
            continue
        title = (entry.get("title") or "").strip()
        link = (entry.get("link") or "").strip()
        if not title or not link:
            continue
        articles.append(
            Article(
                title=title,
                description=strip_html(entry.get("summary", ""))[:600],
                url=link,
                source_name=source.source_name,
                source_domain=source.domain or domain_of(link),
                # feeds sem data confiável: usa o horário de coleta (aproximação)
                published_at=published or collected_at,
                collected_at=collected_at,
                original_query=f"rss:{source.source_name}",
                collector="rss",
                language=source.language,
                country=source.country,
                possible_vertical=hint,
                authority_score=source.authority_score,
            )
        )
        if len(articles) >= MAX_ENTRIES_PER_FEED:
            break
    return articles


class CuratedRssCollector(Collector):
    name = "rss"

    def __init__(self, sources: list[SourceConfig], **kwargs):
        super().__init__(**kwargs)
        self.sources = [s for s in sources if s.enabled]

    def collect(self) -> list[Article]:
        out: list[Article] = []
        for source in self.sources:
            try:
                resp = http_get(source.url, timeout=self.timeout)
            except CollectorFetchError as e:
                log.warning("[collect] rss '%s' falhou: %s", source.source_name, e)
                continue
            out.extend(
                parse_rss_feed(
                    resp.content, source, window_start=self.window_start, collected_at=self.now
                )
            )
        return out
