"""Provider Anthropic (Claude) via SDK oficial.

O SDK já faz retries com backoff para erros transitórios (max_retries=2).
Structured output: instruímos JSON estrito no prompt e validamos com
Pydantic no LLMClient — abordagem compatível com qualquer modelo Claude.
"""

from __future__ import annotations

from src.llm.base import LLMError, LLMProvider, LLMResult, LLMUsage


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float = 120.0):
        try:
            import anthropic
        except ImportError as e:  # pragma: no cover
            raise LLMError("pacote 'anthropic' não instalado (pip install -r requirements.txt)") from e
        self.model = model
        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=2)

    def complete(
        self, *, system: str, user: str, max_output_tokens: int, json_only: bool = True
    ) -> LLMResult:
        try:
            resp = self._client.messages.create(
                model=self.model,
                max_tokens=max_output_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except self._anthropic.APIError as e:
            raise LLMError(f"Anthropic API error: {e}") from e
        except Exception as e:  # timeouts/conexão fora da hierarquia APIError
            raise LLMError(f"Anthropic: falha de comunicação: {e}") from e

        text = "".join(
            block.text for block in resp.content if getattr(block, "type", "") == "text"
        )
        usage = LLMUsage(
            input_tokens=getattr(resp.usage, "input_tokens", 0) or 0,
            output_tokens=getattr(resp.usage, "output_tokens", 0) or 0,
            source="api",
        )
        return LLMResult(text=text, usage=usage, provider=self.name, model=self.model)
