"""Configuração do News Engine.

Duas camadas:
  1. Settings (env/.env)  -> credenciais, provider, janelas, limites.
  2. YAMLs em config/     -> fontes (sources.yaml), verticais (verticals.yaml)
                             e pesos/thresholds de ranking (ranking.yaml).

Os YAMLs são validados com Pydantic no load — erro de configuração falha cedo
com mensagem clara, em vez de quebrar no meio do pipeline.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    # LLM
    llm_provider: str = "anthropic"
    llm_fallback_provider: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"
    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"
    openai_reasoning_effort: str = ""
    llm_max_output_tokens: int = 8192

    # Imagens são geradas SOB DEMANDA pelo dashboard, não no run automático
    # (decisão de 2026-09-01). Ver docs/CONTEXT.md.
    generate_illustrations: bool = False
    openai_image_model: str = "gpt-image-2"
    openai_image_quality: str = "medium"
    openai_image_size: str = "1024x1536"

    # Pipeline
    pipeline_mode: str = "live"  # live | mock
    news_lookback_hours: int = 18
    min_stories_per_vertical: int = 3
    max_stories_per_vertical: int = 5
    timezone: str = "America/Sao_Paulo"
    log_level: str = "INFO"
    data_dir: str = "data"
    config_dir: str = "config"
    http_timeout_seconds: float = 20.0

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """O .env do projeto vence env vars do sistema.

        Motivo (2026-09-01): uma OPENAI_API_KEY antiga numa env var de usuário
        do Windows sobrepunha silenciosamente a key do .env — difícil de
        diagnosticar. Só valores NÃO-VAZIOS do .env têm precedência, então
        deixar uma linha em branco no .env não apaga a env var. No CI não
        existe .env, logo o comportamento lá é inalterado.
        """
        return (
            init_settings,
            _NonEmptyDotEnv(dotenv_settings),
            env_settings,
            dotenv_settings,
            file_secret_settings,
        )


class _NonEmptyDotEnv(PydanticBaseSettingsSource):
    """Wrapper que expõe apenas as chaves preenchidas do .env."""

    def __init__(self, inner: PydanticBaseSettingsSource):
        self._inner = inner
        super().__init__(inner.settings_cls)

    def get_field_value(self, field, field_name):  # pragma: no cover - interface
        raise NotImplementedError

    def __call__(self) -> dict[str, object]:
        return {
            k: v
            for k, v in self._inner().items()
            if not (isinstance(v, str) and v.strip() == "")
        }


# ── preços por 1M tokens (input, output), para ESTIMATIVA de custo ───
# Não é contabilidade: serve para ordem de grandeza no dashboard.
# Atualizar quando trocar de modelo. Match por prefixo do nome do modelo.
PRICE_TABLE_USD_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-4": (3.00, 15.00),
    "claude-haiku-3-5": (0.80, 4.00),
    "gpt-5.6-sol": (5.00, 30.00),
    "gpt-5.6-terra": (2.00, 12.00),
    "gpt-5.6-luna": (0.20, 1.20),
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5-nano": (0.05, 0.40),
    "gpt-5": (1.25, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4o-mini": (0.15, 0.60),
}


IMAGE_PRICE_USD_PER_MTOK_OUT: dict[str, float] = {
    "gpt-image-2": 30.0,
    "gpt-image-1-mini": 8.0,
    "gpt-image-1": 40.0,
}


def estimate_image_cost_usd(model: str, output_tokens: int) -> Optional[float]:
    for prefix, price in sorted(
        IMAGE_PRICE_USD_PER_MTOK_OUT.items(), key=lambda kv: -len(kv[0])
    ):
        if model.startswith(prefix):
            return output_tokens * price / 1_000_000
    return None


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> Optional[float]:
    best_prefix = ""
    for prefix in PRICE_TABLE_USD_PER_MTOK:
        if model.startswith(prefix) and len(prefix) > len(best_prefix):
            best_prefix = prefix
    if not best_prefix:
        return None
    in_price, out_price = PRICE_TABLE_USD_PER_MTOK[best_prefix]
    return (input_tokens * in_price + output_tokens * out_price) / 1_000_000


# ── sources.yaml ─────────────────────────────────────────────────────


class SourceConfig(BaseModel):
    source_name: str
    url: str
    # domínio onde as matérias vivem (nem sempre igual ao host do feed)
    domain: str = ""
    category: str = "general"
    authority_score: int = 50
    language: str = "und"
    country: str = ""
    enabled: bool = True
    vertical_hint: Optional[str] = None  # sobrepõe o mapeamento por categoria


# ── verticals.yaml ───────────────────────────────────────────────────


class GoogleNewsQuery(BaseModel):
    query: str
    hl: str = "pt-BR"
    gl: str = "BR"


class GdeltQuery(BaseModel):
    query: str
    sourcelang: str = ""  # ex.: "por", "eng"
    sourcecountry: str = ""  # ex.: "BR"


class EditorialCriterion(BaseModel):
    name: str
    description: str = ""


class VerticalGuidance(BaseModel):
    value: list[str] = Field(default_factory=list)  # o que valorizar
    avoid: list[str] = Field(default_factory=list)  # o que evitar


class VerticalConfig(BaseModel):
    id: str
    display_name: str
    description: str = ""
    tone: str = ""
    google_news_queries: list[GoogleNewsQuery] = Field(default_factory=list)
    gdelt_queries: list[GdeltQuery] = Field(default_factory=list)
    editorial_criteria: list[EditorialCriterion] = Field(default_factory=list)
    guidance: VerticalGuidance = Field(default_factory=VerticalGuidance)
    official_domains: list[str] = Field(default_factory=list)
    extra_rules: list[str] = Field(default_factory=list)  # regras injetadas nos prompts

    @field_validator("id")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


# ── ranking.yaml ─────────────────────────────────────────────────────


class ClusterParams(BaseModel):
    similarity_threshold: float = 58.0
    title_weight: float = 0.65
    entity_weight: float = 0.35
    max_members_compared: int = 5


class TrendParams(BaseModel):
    weights: dict[str, float] = Field(
        default_factory=lambda: {
            "source_diversity": 0.28,
            "recency": 0.22,
            "velocity": 0.12,
            "authority": 0.18,
            "query_spread": 0.08,
            "novelty": 0.12,
        }
    )
    recency_half_life_hours: float = 9.0
    diversity_cap: int = 6
    velocity_norm_per_hour: float = 2.0
    authority_default: int = 50
    novelty_neutral: float = 0.75
    novelty_lookback_runs: int = 3


class FinalBlend(BaseModel):
    trend: float = 0.40
    editorial: float = 0.60


class VerificationRules(BaseModel):
    # nº mínimo de domínios independentes para VERIFIED
    verified_min_independent: int = 2
    # se só houver 1 fonte, autoridade mínima para PARTIALLY_VERIFIED
    single_source_authority_min: int = 70
    # fonte oficial presente conta como verificação forte (regra POLITICS)
    official_counts_as_verified: bool = False
    # penalidade no final_score por status ("exclude" remove da seleção)
    unverified_action: str = "penalty"  # penalty | exclude
    unverified_penalty: float = 12.0
    partially_verified_penalty: float = 4.0


class LLMBudget(BaseModel):
    max_clusters_to_classify: int = 60
    per_vertical_hint_pool: int = 18
    open_pool: int = 12
    classification_batch_size: int = 15
    editorial_candidates_per_vertical: int = 10


class RankingConfig(BaseModel):
    cluster: ClusterParams = Field(default_factory=ClusterParams)
    trend: TrendParams = Field(default_factory=TrendParams)
    final_blend_default: FinalBlend = Field(default_factory=FinalBlend)
    final_blend_per_vertical: dict[str, FinalBlend] = Field(default_factory=dict)
    min_final_score_default: float = 55.0
    min_final_score_per_vertical: dict[str, float] = Field(default_factory=dict)
    verification_default: VerificationRules = Field(default_factory=VerificationRules)
    verification_per_vertical: dict[str, VerificationRules] = Field(default_factory=dict)
    llm_budget: LLMBudget = Field(default_factory=LLMBudget)

    def final_blend(self, vertical: str) -> FinalBlend:
        return self.final_blend_per_vertical.get(vertical, self.final_blend_default)

    def min_final_score(self, vertical: str) -> float:
        return self.min_final_score_per_vertical.get(vertical, self.min_final_score_default)

    def verification_rules(self, vertical: str) -> VerificationRules:
        return self.verification_per_vertical.get(vertical, self.verification_default)


# ── loaders ──────────────────────────────────────────────────────────


class ConfigError(Exception):
    pass


def _read_yaml(path: Path) -> object:
    if not path.exists():
        raise ConfigError(f"arquivo de configuração não encontrado: {path}")
    try:
        with path.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:  # pragma: no cover - erro raro de sintaxe
        raise ConfigError(f"YAML inválido em {path}: {e}") from e


def load_sources(config_dir: str | Path = "config") -> list[SourceConfig]:
    raw = _read_yaml(Path(config_dir) / "sources.yaml")
    if not isinstance(raw, dict) or "sources" not in raw:
        raise ConfigError("sources.yaml deve ter a chave raiz 'sources'")
    return [SourceConfig.model_validate(item) for item in raw["sources"]]


def load_domain_authority(config_dir: str | Path = "config") -> dict[str, int]:
    """Autoridade por domínio (sources.yaml, chave 'domain_authority').

    Cobre domínios que chegam via Google News/GDELT sem estarem na lista de
    feeds curados. Domínios ausentes recebem o default do ranking.yaml.
    """
    raw = _read_yaml(Path(config_dir) / "sources.yaml")
    table = raw.get("domain_authority", {}) if isinstance(raw, dict) else {}
    if not isinstance(table, dict):
        raise ConfigError("sources.yaml: 'domain_authority' deve ser um mapeamento domínio -> score")
    return {str(k).lower().removeprefix("www."): int(v) for k, v in table.items()}


def load_verticals(config_dir: str | Path = "config") -> dict[str, VerticalConfig]:
    raw = _read_yaml(Path(config_dir) / "verticals.yaml")
    if not isinstance(raw, dict) or "verticals" not in raw:
        raise ConfigError("verticals.yaml deve ter a chave raiz 'verticals'")
    out: dict[str, VerticalConfig] = {}
    for item in raw["verticals"]:
        cfg = VerticalConfig.model_validate(item)
        if cfg.id in out:
            raise ConfigError(f"vertical duplicada em verticals.yaml: {cfg.id}")
        out[cfg.id] = cfg
    if not out:
        raise ConfigError("verticals.yaml não define nenhuma vertical")
    return out


def load_ranking(config_dir: str | Path = "config") -> RankingConfig:
    raw = _read_yaml(Path(config_dir) / "ranking.yaml")
    if not isinstance(raw, dict):
        raise ConfigError("ranking.yaml deve ser um mapeamento YAML")
    cfg = RankingConfig.model_validate(raw)
    total = sum(cfg.trend.weights.values())
    if total <= 0:
        raise ConfigError("ranking.yaml: pesos de trend não podem somar zero")
    # normaliza defensivamente para somar 1.0 — a fórmula continua explícita
    cfg.trend.weights = {k: v / total for k, v in cfg.trend.weights.items()}
    return cfg


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def source_authority_map(
    sources: list[SourceConfig], domain_authority: dict[str, int] | None = None
) -> dict[str, int]:
    """domínio -> authority_score (fontes curadas + tabela domain_authority)."""
    from urllib.parse import urlparse

    out: dict[str, int] = dict(domain_authority or {})
    for s in sources:
        host = (s.domain or urlparse(s.url).netloc).lower().removeprefix("www.")
        if host:
            out[host] = s.authority_score
    return out
