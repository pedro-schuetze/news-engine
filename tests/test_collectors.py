from datetime import timedelta

from src.collectors.fixtures import FixtureCollector
from src.collectors.gdelt import parse_gdelt_response
from src.collectors.google_news import build_query_url, parse_google_news_feed
from src.collectors.rss import parse_rss_feed
from src.config import GoogleNewsQuery, SourceConfig
from tests.conftest import NOW

GN_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Busca</title>
<item>
  <title>TSE aprova novas regras - Agencia Brasil</title>
  <link>https://news.google.com/rss/articles/abc123</link>
  <pubDate>Sun, 30 Aug 2026 09:30:00 GMT</pubDate>
  <source url="https://agenciabrasil.ebc.com.br">Agencia Brasil</source>
  <description>&lt;a href="x"&gt;TSE aprova novas regras&lt;/a&gt;</description>
</item>
<item>
  <title>Noticia velha demais - Jornal</title>
  <link>https://news.google.com/rss/articles/old1</link>
  <pubDate>Mon, 25 Aug 2026 09:30:00 GMT</pubDate>
  <source url="https://jornal.com">Jornal</source>
</item>
</channel></rss>"""

RSS_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title>
<item>
  <title>Webb encontra atmosfera em exoplaneta</title>
  <link>https://www.nasa.gov/webb-exoplanet</link>
  <pubDate>Sun, 30 Aug 2026 08:00:00 GMT</pubDate>
  <description>&lt;p&gt;Descoberta &lt;b&gt;importante&lt;/b&gt; do telescopio.&lt;/p&gt;</description>
</item>
</channel></rss>"""


class TestGoogleNews:
    def test_query_url(self):
        url = build_query_url(GoogleNewsQuery(query="eleições 2026", hl="pt-BR", gl="BR"), 18)
        assert "news.google.com/rss/search" in url
        assert "when%3A18h" in url or "when:18h" in url.replace("+", " ")
        assert "hl=pt-BR" in url
        assert "ceid=BR:pt-419" in url

    def test_parse_strips_source_suffix_and_filters_window(self):
        window_start = NOW - timedelta(hours=18)
        arts = parse_google_news_feed(
            GN_XML,
            query="TSE",
            vertical_id="politics",
            language="pt",
            window_start=window_start,
            collected_at=NOW,
        )
        assert len(arts) == 1  # a antiga fica fora da janela
        a = arts[0]
        assert a.title == "TSE aprova novas regras"
        assert a.source_name == "Agencia Brasil"
        assert a.source_domain == "agenciabrasil.ebc.com.br"
        assert a.possible_vertical == "politics"
        assert a.description == ""  # summary que repete o título é descartado


class TestGdelt:
    def test_parse_and_window(self):
        data = {
            "articles": [
                {
                    "title": "Ancient city discovered in Amazon",
                    "url": "https://livescience.com/x",
                    "domain": "www.livescience.com",
                    "language": "English",
                    "seendate": (NOW - timedelta(hours=3)).strftime("%Y%m%dT%H%M%SZ"),
                    "sourcecountry": "United States",
                },
                {
                    "title": "Too old",
                    "url": "https://a.com/y",
                    "domain": "a.com",
                    "language": "English",
                    "seendate": (NOW - timedelta(hours=30)).strftime("%Y%m%dT%H%M%SZ"),
                },
            ]
        }
        arts = parse_gdelt_response(
            data, query="archaeology", vertical_id="facts",
            window_start=NOW - timedelta(hours=18), collected_at=NOW,
        )
        assert len(arts) == 1
        assert arts[0].language == "en"
        assert arts[0].source_domain == "livescience.com"
        assert arts[0].collector == "gdelt"


class TestRss:
    def test_parse_uses_source_config(self):
        cfg = SourceConfig(
            source_name="NASA",
            url="https://www.nasa.gov/rss/dyn/breaking_news.rss",
            domain="nasa.gov",
            category="official",
            authority_score=95,
            language="en",
            vertical_hint="facts",
        )
        arts = parse_rss_feed(RSS_XML, cfg, window_start=NOW - timedelta(hours=18), collected_at=NOW)
        assert len(arts) == 1
        a = arts[0]
        assert a.source_name == "NASA"
        assert a.source_domain == "nasa.gov"
        assert a.authority_score == 95
        assert a.possible_vertical == "facts"
        assert "<p>" not in a.description


class TestFixtureCollector:
    def test_loads_and_respects_lookback(self):
        collector = FixtureCollector("tests/fixtures/articles.json", now=NOW, lookback_hours=18)
        arts = collector.collect()
        assert len(arts) > 20
        # o item com published_hours_ago=40 fica fora da janela de 18h
        assert all(a.published_at >= collector.window_start for a in arts)
        assert all(a.collector == "fixture" for a in arts)
