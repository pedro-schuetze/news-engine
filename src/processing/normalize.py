"""Normalização determinística — tudo que dá para resolver sem LLM.

Funções puras e testáveis: normalizar títulos, URLs (remoção de tracking),
domínios, datas e limpeza de HTML.
"""

from __future__ import annotations

import calendar
import html
import logging
import re
import time
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from src.models import Article

log = logging.getLogger("news_engine.normalize")

# parâmetros de tracking removidos das URLs (além de qualquer utm_*)
TRACKING_PARAMS = {
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "twclid",
    "igshid",
    "igsh",
    "ocid",
    "cmpid",
    "smid",
    "smtyp",
    "ito",
    "ref",
    "ref_src",
    "ref_url",
    "referrer",
    "source",
    "src",
    "mc_cid",
    "mc_eid",
    "s_kwcid",
    "srsltid",
    "sref",
    "partner",
    "ICID",
    "icid",
    "spm",
    "sc_channel",
    "at_medium",
    "at_campaign",
    "xtor",
}

_WHITESPACE_RE = re.compile(r"\s+")
_TAG_RE = re.compile(r"<[^>]+>")
_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def strip_html(text: str) -> str:
    """Remove tags e entidades HTML, colapsando whitespace."""
    if not text:
        return ""
    return _WHITESPACE_RE.sub(" ", html.unescape(_TAG_RE.sub(" ", text))).strip()


def normalize_title(title: str) -> str:
    """Título limpo para exibição: sem HTML, whitespace colapsado, sem aspas soltas."""
    t = strip_html(title or "")
    t = t.strip(" \t\"'“”‘’")
    return _WHITESPACE_RE.sub(" ", t).strip()


def title_key(title: str) -> str:
    """Chave canônica para comparação de títulos: minúsculas, sem pontuação."""
    t = normalize_title(title).lower()
    t = _PUNCT_RE.sub(" ", t)
    return _WHITESPACE_RE.sub(" ", t).strip()


def normalize_url(url: str) -> str:
    """Remove tracking/fragment e canoniza host — determinístico e reversível de auditar."""
    if not url:
        return ""
    try:
        parts = urlparse(url.strip())
    except ValueError:
        return url.strip()
    scheme = (parts.scheme or "https").lower()
    netloc = parts.netloc.lower()
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    if netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]
    query_pairs = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k not in TRACKING_PARAMS
    ]
    path = parts.path or ""
    if path.endswith("/") and len(path) > 1:
        path = path.rstrip("/")
    return urlunparse((scheme, netloc, path, "", urlencode(query_pairs), ""))


def domain_of(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
    except ValueError:
        return ""
    host = host.split(":")[0]
    for prefix in ("www.", "m.", "amp."):
        if host.startswith(prefix):
            host = host[len(prefix) :]
    return host


def struct_time_to_datetime(st: time.struct_time | None) -> datetime | None:
    """feedparser entrega struct_time em UTC; converte para datetime aware."""
    if st is None:
        return None
    try:
        return datetime.fromtimestamp(calendar.timegm(st), tz=timezone.utc)
    except (ValueError, OverflowError):
        return None


def parse_gdelt_date(raw: str) -> datetime | None:
    """GDELT usa 'YYYYMMDDTHHMMSSZ'."""
    try:
        return datetime.strptime(raw.strip(), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def normalize_articles(articles: list[Article]) -> list[Article]:
    """Preenche campos derivados e descarta itens inutilizáveis (sem título/URL)."""
    out: list[Article] = []
    dropped = 0
    for a in articles:
        title = normalize_title(a.title)
        if not title or not a.url:
            dropped += 1
            continue
        a.title = title
        a.normalized_title = title_key(title)
        a.canonical_url = normalize_url(a.canonical_url or a.url)
        a.url = normalize_url(a.url)
        if not a.source_domain:
            a.source_domain = domain_of(a.canonical_url or a.url)
        a.description = strip_html(a.description)[:600]
        if a.description and title_key(a.description) == a.normalized_title:
            a.description = ""  # descrição que só repete o título não agrega
        a.published_at = ensure_utc(a.published_at)
        a.collected_at = ensure_utc(a.collected_at)
        out.append(a)
    if dropped:
        log.info("[normalize] %d artigos descartados por falta de título/URL", dropped)
    return out
