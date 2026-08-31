"""Abstração de LLM.

- LLMProvider: interface mínima (complete -> texto + usage).
- LLMClient: orquestra provider primário + fallback opcional, exige JSON
  validado por um schema Pydantic, faz retries limitados e contabiliza
  chamadas/tokens/custo. O pipeline SÓ fala com o LLMClient.

Providers concretos: anthropic_provider, openai_provider, mock_provider.
"""

from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from src.config import Settings, estimate_cost_usd
from src.models import LLMCallLog

log = logging.getLogger("news_engine.llm")

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Falha de comunicação/execução com o provider."""


class LLMValidationError(LLMError):
    """O provider respondeu, mas nunca produziu JSON válido para o schema."""


@dataclass
class LLMUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    source: str = "api"  # api | estimate


@dataclass
class LLMResult:
    text: str
    usage: LLMUsage
    provider: str
    model: str


class LLMProvider(ABC):
    name: str = "base"
    model: str = ""

    @abstractmethod
    def complete(
        self, *, system: str, user: str, max_output_tokens: int, json_only: bool = True
    ) -> LLMResult:
        """Uma chamada de completions. Deve levantar LLMError em falhas."""


def extract_json(text: str) -> str:
    """Extrai o primeiro objeto/array JSON balanceado de um texto.

    Tolera cercas de código e prosa antes/depois do JSON — necessário para
    providers sem structured output nativo.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl != -1:
            cleaned = cleaned[first_nl + 1 :]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
        cleaned = cleaned.strip()

    starts = [i for i in (cleaned.find("{"), cleaned.find("[")) if i != -1]
    if not starts:
        raise ValueError("nenhum JSON encontrado na resposta")
    start = min(starts)
    opener = cleaned[start]
    closer = "}" if opener == "{" else "]"

    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(cleaned)):
        ch = cleaned[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                if ch != closer and cleaned[start] in "{[":
                    # fechamento trocado — deixa o json.loads apontar o erro
                    pass
                return cleaned[start : i + 1]
    raise ValueError("JSON truncado ou desbalanceado na resposta")


@dataclass
class LLMClient:
    primary: LLMProvider
    fallback: LLMProvider | None = None
    max_output_tokens: int = 8192
    calls: list[LLMCallLog] = field(default_factory=list)

    def generate(
        self,
        schema: type[T],
        *,
        system: str,
        user: str,
        purpose: str,
        attempts_per_provider: int = 2,
    ) -> T:
        """Chama o LLM e retorna uma instância validada de `schema`.

        Retries limitados por provider; se o primário esgotar as tentativas,
        tenta o fallback (quando configurado). Nunca entra em loop infinito.
        """
        providers = [self.primary] + ([self.fallback] if self.fallback else [])
        last_error: Exception | None = None

        for provider in providers:
            prompt_user = user
            for attempt in range(1, attempts_per_provider + 1):
                t0 = time.monotonic()
                record = LLMCallLog(
                    purpose=purpose,
                    provider=provider.name,
                    model=provider.model,
                    attempts=attempt,
                    ok=False,
                )
                try:
                    result = provider.complete(
                        system=system,
                        user=prompt_user,
                        max_output_tokens=self.max_output_tokens,
                        json_only=True,
                    )
                except LLMError as e:
                    record.duration_seconds = round(time.monotonic() - t0, 2)
                    self.calls.append(record)
                    last_error = e
                    log.warning(
                        "[llm] %s falhou (%s, tentativa %d): %s",
                        purpose,
                        provider.name,
                        attempt,
                        e,
                    )
                    continue

                record.duration_seconds = round(time.monotonic() - t0, 2)
                record.input_tokens = result.usage.input_tokens
                record.output_tokens = result.usage.output_tokens

                try:
                    payload = extract_json(result.text)
                    parsed = schema.model_validate(json.loads(payload))
                    record.ok = True
                    self.calls.append(record)
                    return parsed
                except (ValueError, ValidationError, json.JSONDecodeError) as e:
                    self.calls.append(record)
                    last_error = e
                    log.warning(
                        "[llm] %s: resposta inválida (%s, tentativa %d): %s",
                        purpose,
                        provider.name,
                        attempt,
                        str(e)[:300],
                    )
                    prompt_user = (
                        user
                        + "\n\nATENCAO: sua resposta anterior nao era JSON valido para o "
                        + "schema pedido. Erro: "
                        + str(e)[:500]
                        + "\nResponda SOMENTE com JSON valido, sem markdown e sem texto extra."
                    )

        raise LLMValidationError(
            f"LLM nao produziu JSON valido para '{purpose}' apos retries: {last_error}"
        )

    # ── contabilidade ────────────────────────────────────────────────

    @property
    def total_calls(self) -> int:
        return len(self.calls)

    @property
    def total_input_tokens(self) -> int:
        return sum(c.input_tokens for c in self.calls)

    @property
    def total_output_tokens(self) -> int:
        return sum(c.output_tokens for c in self.calls)

    def estimated_cost_usd(self) -> float | None:
        total: float = 0.0
        any_known = False
        for c in self.calls:
            cost = estimate_cost_usd(c.model, c.input_tokens, c.output_tokens)
            if cost is not None:
                total += cost
                any_known = True
        return round(total, 4) if any_known else None


def build_llm_client(settings: Settings, *, mock: bool = False) -> LLMClient:
    """Monta o LLMClient a partir das Settings (ou o mock, sem custo)."""
    if mock:
        from src.llm.mock_provider import MockProvider

        return LLMClient(primary=MockProvider(), max_output_tokens=settings.llm_max_output_tokens)

    def make(name: str) -> LLMProvider:
        name = name.strip().lower()
        if name == "anthropic":
            if not settings.anthropic_api_key:
                raise LLMError(
                    "LLM_PROVIDER=anthropic exige ANTHROPIC_API_KEY no ambiente/.env "
                    "(a API é separada da assinatura Claude Pro)"
                )
            from src.llm.anthropic_provider import AnthropicProvider

            return AnthropicProvider(
                api_key=settings.anthropic_api_key, model=settings.anthropic_model
            )
        if name == "openai":
            if not settings.openai_api_key:
                raise LLMError("LLM_PROVIDER=openai exige OPENAI_API_KEY no ambiente/.env")
            from src.llm.openai_provider import OpenAIProvider

            return OpenAIProvider(
                api_key=settings.openai_api_key,
                model=settings.openai_model,
                reasoning_effort=settings.openai_reasoning_effort,
            )
        raise LLMError(f"provider LLM desconhecido: '{name}' (use anthropic ou openai)")

    primary = make(settings.llm_provider)
    fallback: LLMProvider | None = None
    fb_name = settings.llm_fallback_provider.strip().lower()
    if fb_name and fb_name != settings.llm_provider.strip().lower():
        try:
            fallback = make(fb_name)
        except LLMError as e:
            log.warning("[llm] fallback '%s' ignorado: %s", fb_name, e)

    return LLMClient(
        primary=primary, fallback=fallback, max_output_tokens=settings.llm_max_output_tokens
    )
