"""Precedência de configuração e loaders de YAML."""

from src.config import (
    Settings,
    load_domain_authority,
    load_ranking,
    load_sources,
    load_verticals,
    source_authority_map,
)


class TestEnvPrecedence:
    """O .env do projeto vence env vars do sistema.

    Regressão de 2026-09-01: uma OPENAI_API_KEY antiga numa env var de usuário
    do Windows sobrepunha silenciosamente a key do .env, e o pipeline usava a
    key errada (sem acesso ao modelo) sem nenhum aviso.
    """

    def test_dotenv_wins_over_process_env(self, tmp_path, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-da-env-var")
        env_file = tmp_path / ".env"
        env_file.write_text("OPENAI_API_KEY=sk-do-dotenv\n", encoding="utf-8")
        assert Settings(_env_file=str(env_file)).openai_api_key == "sk-do-dotenv"

    def test_empty_dotenv_value_does_not_erase_env_var(self, tmp_path, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-da-env-var")
        env_file = tmp_path / ".env"
        env_file.write_text("OPENAI_API_KEY=\n", encoding="utf-8")
        assert Settings(_env_file=str(env_file)).openai_api_key == "sk-da-env-var"

    def test_env_var_used_when_no_dotenv(self, monkeypatch):
        # é o caso do CI: não existe .env no repositório
        monkeypatch.setenv("OPENAI_API_KEY", "sk-do-ci")
        assert Settings(_env_file=None).openai_api_key == "sk-do-ci"


class TestYamlConfigs:
    """Os YAMLs reais do repo precisam carregar e validar."""

    def test_verticals(self):
        verticals = load_verticals("config")
        assert set(verticals) == {"entertainment", "politics", "facts"}
        for v in verticals.values():
            assert v.display_name and v.description and v.tone
            assert v.editorial_criteria
            assert v.google_news_queries

    def test_sources_and_authority(self):
        sources = load_sources("config")
        assert any(s.enabled for s in sources)
        table = source_authority_map(sources, load_domain_authority("config"))
        assert table["tse.jus.br"] > table["tmz.com"]

    def test_ranking(self):
        cfg = load_ranking("config")
        assert abs(sum(cfg.trend.weights.values()) - 1.0) < 1e-9
        # política deve pesar mais editorial/confiabilidade que entretenimento
        assert cfg.final_blend("politics").trend < cfg.final_blend("entertainment").trend
        assert cfg.verification_rules("politics").unverified_action == "exclude"
