"""Collector do GDELT DOC 2.0 API (gratuito, sem key).

Independente dos demais: se o GDELT estiver fora do ar, loga warning e o
pipeline segue com Google News + RSS.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

from src.collectors.base import Collector, CollectorFetchError, http_get
from src.config import GdeltQuery, VerticalConfig
from src.models import Article
from src.processing.normalize import parse_gdelt_date

log = logging.getLogger("news_engine.collect")

_BASE = "https://api.gdeltproject.org/api/v2/doc/doc"

_LANG_MAP = {
    "portuguese": "pt",
    "english": "en",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
}


def _norm_lang(raw: str) -> str:
    low = (raw or "").strip().lower()
    return _LANG_MAP.get(low, low[:2] or "und")


def parse_gdelt_response(
    data: dict,
    *,
    query: str,
    vertical_id: str,
    window_start: datetime,
    collected_at: datetime,
) -> list[Article]:
    articles: list[Article] = []
    for item in data.get("articles", []):
        published = parse_gdelt_date(item.get("seendate", ""))
        if published is None or published < window_start:
            continue
        title = (item.get("title") or "").strip()
        url = (item.get("url") or "").strip()
        if not title or not url:
            continue
        articles.append(
            Article(
                title=title,
                description="",  # GDELT ArtList não fornece snippet
                url=url,
                source_name=item.get("domain", ""),
                source_domain=(item.get("domain") or "").lower().removeprefix("www."),
                published_at=published,
                collected_at=collected_at,
                original_query=query,
                collector="gdelt",
                language=_norm_lang(item.get("language", "")),
                country=item.get("sourcecountry", ""),
                possible_vertical=vertical_id,
            )
        )
    return articles


class GdeltCollector(Collector):
    name = "gdelt"

    def __init__(self, verticals: dict[str, VerticalConfig], max_records: int = 60, **kwargs):
        super().__init__(**kwargs)
        self.verticals = verticals
        self.max_records = max_records

    def _params(self, q: GdeltQuery) -> dict:
        query = q.query
        if q.sourcelang:
            query += f" sourcelang:{q.sourcelang}"
        if q.sourcecountry:
            query += f" sourcecountry:{q.sourcecountry}"
        return {
            "query": query,
            "mode": "ArtList",
            "format": "json",
            "timespan": f"{self.lookback_hours}h",
            "maxrecords": str(self.max_records),
            "sort": "hybridrel",
        }

    def collect(self) -> list[Article]:
        out: list[Article] = []
        seen: set[str] = set()
        for vertical in self.verticals.values():
            for q in vertical.gdelt_queries:
                try:
                    resp = http_get(_BASE, params=self._params(q), timeout=self.timeout)
                    data = resp.json()
                except CollectorFetchError as e:
                    log.warning("[collect] gdelt query '%s' falhou: %s", q.query, e)
                    continue
                except (json.JSONDecodeError, ValueError) as e:
                    # GDELT às vezes devolve HTML de erro com status 200
                    log.warning("[collect] gdelt query '%s': resposta não-JSON (%s)", q.query, e)
                    continue
                items = parse_gdelt_response(
                    data,
                    query=q.query,
                    vertical_id=vertical.id,
                    window_start=self.window_start,
                    collected_at=self.now,
                )
                fresh = [a for a in items if a.url not in seen]
                seen.update(a.url for a in fresh)
                out.extend(fresh)
        return out
