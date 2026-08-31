import pytest
from pydantic import BaseModel

from src.config import estimate_cost_usd
from src.llm.base import (
    LLMClient,
    LLMError,
    LLMProvider,
    LLMResult,
    LLMUsage,
    LLMValidationError,
    extract_json,
)


class Payload(BaseModel):
    name: str
    value: int


class FakeProvider(LLMProvider):
    """Provider de teste com respostas roteirizadas."""

    def __init__(self, name: str, model: str, responses: list[str | Exception]):
        self.name = name
        self.model = model
        self._responses = list(responses)
        self.calls = 0

    def complete(self, *, system, user, max_output_tokens, json_only=True) -> LLMResult:
        self.calls += 1
        if not self._responses:
            raise LLMError("sem respostas roteirizadas")
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return LLMResult(
            text=item, usage=LLMUsage(input_tokens=100, output_tokens=20), provider=self.name, model=self.model
        )


class TestExtractJson:
    def test_plain(self):
        assert extract_json('{"a": 1}') == '{"a": 1}'

    def test_fenced(self):
        assert extract_json('```json\n{"a": 1}\n```') == '{"a": 1}'

    def test_with_prose_around(self):
        assert extract_json('Claro! Segue:\n{"a": {"b": [1, 2]}}\nEspero ter ajudado.') == '{"a": {"b": [1, 2]}}'

    def test_braces_inside_strings(self):
        raw = '{"text": "um { dentro } de string \\" ok"}'
        assert extract_json(raw) == raw

    def test_truncated_raises(self):
        with pytest.raises(ValueError):
            extract_json('{"a": [1, 2')

    def test_no_json_raises(self):
        with pytest.raises(ValueError):
            extract_json("sem json aqui")


class TestLLMClient:
    def test_retry_after_invalid_json(self):
        provider = FakeProvider("fake", "fake-1", ["isso não é json", '{"name": "ok", "value": 7}'])
        client = LLMClient(primary=provider)
        result = client.generate(Payload, system="s", user="u", purpose="test")
        assert result.value == 7
        assert provider.calls == 2
        assert client.total_calls == 2
        assert client.calls[0].ok is False
        assert client.calls[1].ok is True

    def test_retry_after_schema_mismatch(self):
        provider = FakeProvider("fake", "fake-1", ['{"name": "x"}', '{"name": "x", "value": 1}'])
        client = LLMClient(primary=provider)
        assert client.generate(Payload, system="s", user="u", purpose="t").value == 1

    def test_fallback_provider_used(self):
        primary = FakeProvider("primario", "p-1", ["lixo", "mais lixo"])
        fallback = FakeProvider("fallback", "f-1", ['{"name": "fb", "value": 3}'])
        client = LLMClient(primary=primary, fallback=fallback)
        result = client.generate(Payload, system="s", user="u", purpose="t")
        assert result.name == "fb"
        assert primary.calls == 2
        assert fallback.calls == 1

    def test_gives_up_after_retries(self):
        provider = FakeProvider("fake", "fake-1", ["lixo", "lixo", "lixo"])
        client = LLMClient(primary=provider)
        with pytest.raises(LLMValidationError):
            client.generate(Payload, system="s", user="u", purpose="t", attempts_per_provider=2)
        assert provider.calls == 2  # nunca loop infinito

    def test_provider_error_counts_as_attempt(self):
        provider = FakeProvider("fake", "fake-1", [LLMError("boom"), '{"name": "ok", "value": 1}'])
        client = LLMClient(primary=provider)
        assert client.generate(Payload, system="s", user="u", purpose="t").value == 1

    def test_usage_totals(self):
        provider = FakeProvider("fake", "fake-1", ['{"name": "a", "value": 1}'])
        client = LLMClient(primary=provider)
        client.generate(Payload, system="s", user="u", purpose="t")
        assert client.total_input_tokens == 100
        assert client.total_output_tokens == 20


class TestCostEstimate:
    def test_known_model(self):
        cost = estimate_cost_usd("gpt-5-mini", 1_000_000, 1_000_000)
        assert cost == pytest.approx(0.25 + 2.00)

    def test_prefix_prefers_longest_match(self):
        # gpt-5-mini não pode cair no preço de gpt-5
        assert estimate_cost_usd("gpt-5-mini", 1_000_000, 0) == pytest.approx(0.25)

    def test_unknown_model_returns_none(self):
        assert estimate_cost_usd("modelo-desconhecido", 1000, 1000) is None
