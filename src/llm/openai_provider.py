"""Provider OpenAI via SDK oficial (Chat Completions).

Particularidades tratadas aqui:
- json_only usa response_format={"type": "json_object"} (JSON mode);
- modelos de reasoning (família gpt-5/o*) não aceitam `temperature` — por
  isso nunca enviamos temperature;
- `reasoning_effort` só é enviado quando configurado; se o modelo rejeitar
  um parâmetro opcional (400), removemos o parâmetro e tentamos 1 vez.
"""

from __future__ import annotations

from src.llm.base import LLMError, LLMProvider, LLMResult, LLMUsage

_OPTIONAL_PARAMS = ("reasoning_effort", "response_format", "max_completion_tokens")


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str, reasoning_effort: str = "", timeout: float = 120.0):
        try:
            import openai
        except ImportError as e:  # pragma: no cover
            raise LLMError("pacote 'openai' não instalado (pip install -r requirements.txt)") from e
        self.model = model
        self.reasoning_effort = reasoning_effort.strip()
        self._openai = openai
        self._client = openai.OpenAI(api_key=api_key, timeout=timeout, max_retries=2)

    def complete(
        self, *, system: str, user: str, max_output_tokens: int, json_only: bool = True
    ) -> LLMResult:
        kwargs: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_completion_tokens": max_output_tokens,
        }
        if json_only:
            kwargs["response_format"] = {"type": "json_object"}
        if self.reasoning_effort:
            kwargs["reasoning_effort"] = self.reasoning_effort

        resp = self._create_with_param_fallback(kwargs)

        text = resp.choices[0].message.content or ""
        usage = LLMUsage(source="api")
        if getattr(resp, "usage", None):
            usage.input_tokens = resp.usage.prompt_tokens or 0
            usage.output_tokens = resp.usage.completion_tokens or 0
        return LLMResult(text=text, usage=usage, provider=self.name, model=self.model)

    def _create_with_param_fallback(self, kwargs: dict):
        """Chama a API; em 400 por parâmetro não suportado, remove e re-tenta.

        Mantém compatibilidade entre gerações de modelos (ex.: modelos antigos
        que exigem max_tokens em vez de max_completion_tokens).
        """
        attempts = len(_OPTIONAL_PARAMS) + 1
        for _ in range(attempts):
            try:
                return self._client.chat.completions.create(**kwargs)
            except self._openai.BadRequestError as e:
                msg = str(e)
                if "max_completion_tokens" in msg and "max_completion_tokens" in kwargs:
                    kwargs["max_tokens"] = kwargs.pop("max_completion_tokens")
                    continue
                stripped = False
                for param in _OPTIONAL_PARAMS:
                    if param in kwargs and param in msg:
                        kwargs.pop(param)
                        stripped = True
                        break
                if stripped:
                    continue
                raise LLMError(f"OpenAI rejeitou a requisição: {e}") from e
            except self._openai.APIError as e:
                raise LLMError(f"OpenAI API error: {e}") from e
            except Exception as e:
                raise LLMError(f"OpenAI: falha de comunicação: {e}") from e
        raise LLMError("OpenAI: esgotadas as tentativas de ajuste de parâmetros")
