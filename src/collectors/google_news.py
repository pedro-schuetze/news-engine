"""Collector do Google News RSS (busca por query, sem API paga).

Uma requisição por query configurada em config/verticals.yaml. Cada query
carrega hl/gl (idioma/país), o que permite cobrir Brasil + internacional.

Limitação conhecida: os links do Google News são redirects
(news.google.com/rss/articles/...) e não são resolvidos no MVP — o domínio
real da matéria vem da tag <source> do feed, o que basta para dedupe,
clustering, autoridade e auditoria. Documentado em docs/architecture.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from urllib.parse import quote_plus

import feedparser

from src.collectors.base import Collector, CollectorFetchError, http_get
from src.config import GoogleNewsQuery, VerticalConfig
from src.models import Article
from src.processing.normalize import domain_of, strip_html, struct_time_to_datetime

log = logging.getLogger("news_engine.collect")

_BASE = "https://news.google.com/rss/search"


def _ceid_for(hl: str, gl: str) -> str:
    lang = "pt-419" if hl.lower().startswith("pt") else hl.split("-")[0].lower()
    return f"{gl.upper()}:{lang}"


def build_query_url(q: GoogleNewsQuery, lookback_hours: int) -> str:
    query = f"{q.query} when:{lookback_hours}h"
    return (
        f"{_BASE}?q={quote_plus(query)}&hl={q.hl}&gl={q.gl.upper()}"
        f"&ceid={_ceid_for(q.hl, q.gl)}"
    )


def parse_google_news_feed(
    content: bytes,
    *,
    query: str,
    vertical_id: str,
    language: str,
    window_start: datetime,
    collected_at: datetime,
) -> list[Article]:
    feed = feedparser.parse(content)
    articles: list[Article] = []
    for entry in feed.entries:
        published = struct_time_to_datetime(entry.get("published_parsed"))
        if published is None or published < window_start or published > collected_at:
            continue
        title = (entry.get("title") or "").strip()
        link = (entry.get("link") or "").strip()
        if not title or not link:
            continue

        source = entry.get("source") or {}
        source_name = (source.get("title") or "").strip()
        source_href = (source.get("href") or "").strip()
        # títulos do GN terminam com " - Veículo"; remove quando redundante
        if source_name and title.endswith(f" - {source_name}"):
            title = title[: -len(f" - {source_name}")].rstrip()
        elif " - " in title and not source_name:
            title, _, source_name = title.rpartition(" - ")

        description = strip_html(entry.get("summary", ""))
        # o summary do GN costuma ser só um link com o próprio título — descarta
        if description.lower().startswith(title.lower()[:40]):
            description = ""

        articles.append(
            Article(
                title=title,
                description=description,
                url=link,
                source_name=source_name,
                source_domain=domain_of(source_href) if source_href else "",
                published_at=published,
                collected_at=collected_at,
                original_query=query,
                collector="google_news",
                language=language,
                possible_vertical=vertical_id,
            )
        )
    return articles


class GoogleNewsCollector(Collector):
    name = "google_news"

    def __init__(self, verticals: dict[str, VerticalConfig], **kwargs):
        super().__init__(**kwargs)
        self.verticals = verticals

    def collect(self) -> list[Article]:
        out: list[Article] = []
        seen_links: set[str] = set()
        for vertical in self.verticals.values():
            for q in vertical.google_news_queries:
                url = build_query_url(q, self.lookback_hours)
                try:
                    resp = http_get(url, timeout=self.timeout)
                except CollectorFetchError as e:
                    log.warning("[collect] google_news query '%s' falhou: %s", q.query, e)
                    continue
                items = parse_google_news_feed(
                    resp.content,
                    query=q.query,
                    vertical_id=vertical.id,
                    language="pt" if q.hl.lower().startswith("pt") else q.hl.split("-")[0],
                    window_start=self.window_start,
                    collected_at=self.now,
                )
                fresh = [a for a in items if a.url not in seen_links]
                seen_links.update(a.url for a in fresh)
                out.extend(fresh)
                time.sleep(0.25)  # cortesia com o endpoint público
        return out
