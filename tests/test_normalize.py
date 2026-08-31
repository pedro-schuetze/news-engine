from datetime import timezone

from src.processing.normalize import (
    domain_of,
    normalize_articles,
    normalize_title,
    normalize_url,
    parse_gdelt_date,
    strip_html,
    title_key,
)
from tests.conftest import make_article


class TestNormalizeUrl:
    def test_removes_tracking_params(self):
        url = "https://g1.globo.com/noticia?utm_source=push&utm_medium=app&fbclid=abc&id=42"
        assert normalize_url(url) == "https://g1.globo.com/noticia?id=42"

    def test_removes_fragment_and_trailing_slash(self):
        assert normalize_url("https://ex.com/path/#section") == "https://ex.com/path"

    def test_lowercases_host_keeps_path_case(self):
        assert normalize_url("https://EX.com/PaTh") == "https://ex.com/PaTh"

    def test_removes_default_ports(self):
        assert normalize_url("https://ex.com:443/a") == "https://ex.com/a"
        assert normalize_url("http://ex.com:80/a") == "http://ex.com/a"

    def test_keeps_meaningful_params(self):
        assert normalize_url("https://ex.com/a?page=2&utm_id=9") == "https://ex.com/a?page=2"


class TestTitles:
    def test_normalize_title_unescapes_and_collapses(self):
        assert normalize_title("  TSE &amp; Congresso \n aprovam ") == "TSE & Congresso aprovam"

    def test_title_key_removes_punct_and_case(self):
        assert title_key('TSE aprova: "novas regras"!') == "tse aprova novas regras"

    def test_strip_html(self):
        assert strip_html("<p>Ol&aacute; <b>mundo</b></p>") == "Olá mundo"


class TestDates:
    def test_parse_gdelt_date(self):
        dt = parse_gdelt_date("20260830T101500Z")
        assert dt is not None
        assert dt.tzinfo == timezone.utc
        assert (dt.year, dt.hour, dt.minute) == (2026, 10, 15)

    def test_parse_gdelt_date_invalid(self):
        assert parse_gdelt_date("not-a-date") is None


class TestNormalizeArticles:
    def test_fills_derived_fields(self):
        art = make_article(
            title="  Título &amp; teste  ",
            url="https://Ex.com/a?utm_source=x",
            source_domain="",
        )
        out = normalize_articles([art])
        assert len(out) == 1
        a = out[0]
        assert a.title == "Título & teste"
        assert a.normalized_title == "título teste"
        assert a.url == "https://ex.com/a"
        assert a.source_domain == "ex.com"

    def test_drops_articles_without_title(self):
        assert normalize_articles([make_article(title="   ")]) == []

    def test_clears_description_equal_to_title(self):
        art = make_article(title="Mesmo texto", description="Mesmo texto")
        assert normalize_articles([art])[0].description == ""

    def test_domain_of_strips_prefixes(self):
        assert domain_of("https://www.ex.com/a") == "ex.com"
        assert domain_of("https://amp.ex.com:8080/a") == "ex.com"
