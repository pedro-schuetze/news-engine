"""Base dos collectors.

Contrato: `collect()` retorna a lista de Articles que conseguiu coletar e
NUNCA propaga falha de rede/fonte — loga warning e devolve o que tiver.
Falha de uma fonte não pode derrubar o pipeline (requisito de resiliência).
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

import httpx

from src.models import Article

log = logging.getLogger("news_engine.collect")

# headers HTTP precisam ser ASCII (httpx rejeita não-ASCII antes de enviar)
USER_AGENT = "news-engine/0.1 (+https://github.com/pedro-schuetze/news-engine)"


class CollectorFetchError(Exception):
    pass


def http_get(url: str, *, params: dict | None = None, timeout: float = 20.0, retries: int = 2) -> httpx.Response:
    """GET com retries moderados e timeout — nunca loop infinito."""
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = httpx.get(
                url,
                params=params,
                timeout=timeout,
                headers={"User-Agent": USER_AGENT},
                follow_redirects=True,
            )
            resp.raise_for_status()
            return resp
        except (httpx.HTTPError, UnicodeError) as e:
            # UnicodeError: header/URL com caractere inválido não pode derrubar o collector
            last = e
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise CollectorFetchError(f"GET {url} falhou após {retries + 1} tentativas: {last}")


class Collector(ABC):
    name: str = "base"

    def __init__(self, *, now: datetime | None = None, lookback_hours: int = 18, timeout: float = 20.0):
        self.now = now or datetime.now(timezone.utc)
        self.lookback_hours = lookback_hours
        self.timeout = timeout

    @property
    def window_start(self) -> datetime:
        return self.now - timedelta(hours=self.lookback_hours)

    @abstractmethod
    def collect(self) -> list[Article]:
        """Retorna artigos coletados; falhas parciais são logadas, não propagadas."""
