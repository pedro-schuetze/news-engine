"""Teste de integração ponta a ponta em modo mock (sem rede, sem custo).

É o mesmo caminho executado pelo CI e por `python -m src.pipeline --mock`.
"""

from src.config import Settings
from src.pipeline import run_pipeline

FIXTURES = "tests/fixtures/articles.json"


def _settings(tmp_path) -> Settings:
    return Settings(_env_file=None, data_dir=str(tmp_path), pipeline_mode="mock")


def test_full_mock_run(tmp_path):
    run = run_pipeline(_settings(tmp_path), mock=True, fixture_path=FIXTURES)
    s = run.stats

    # coleta: 28 fixtures, 1 fora da janela de 18h
    assert run.mode == "mock"
    assert s.articles_collected == 27
    assert s.duplicates_removed >= 1  # cópia sindicada do UOL (título idêntico)
    assert s.articles_after_dedupe == s.articles_collected - s.duplicates_removed
    assert s.story_clusters > 5
    assert s.clusters_classified > 0
    assert s.clusters_discarded >= 1  # horóscopo/promoção devem cair

    # custo/contabilidade
    assert s.llm_calls > 0
    assert s.estimated_input_tokens > 0
    assert s.estimated_output_tokens > 0
    assert s.token_usage_source == "estimate"

    # verticais e seleção
    assert set(run.verticals.keys()) == {"entertainment", "politics", "facts"}
    total = sum(len(v.stories) for v in run.verticals.values())
    assert total == s.stories_selected
    assert total >= 4
    for vr in run.verticals.values():
        assert len(vr.stories) >= 1
        assert len(vr.stories) <= 5
        for story in vr.stories:
            assert story.draft is not None, f"story sem draft: {story.title}"
            assert len(story.draft.slides) >= 3
            assert story.draft.caption
            assert all(s_.image_direction for s_ in story.draft.slides)
            assert story.verification.primary_source is not None
            assert 0 <= story.final_score <= 100
            assert story.selection_rank >= 1
            assert story.run_id == run.run_id

    # persistência
    assert (tmp_path / "latest.json").exists()
    assert list((tmp_path / "runs").glob("*.json"))

    # auditabilidade
    assert run.debug is not None
    assert run.debug.articles and run.debug.clusters and run.debug.classifications
    assert run.debug.llm_log


def test_politics_unverified_claim_is_excluded(tmp_path):
    """Regra de rigor da POLITICS: alegação de fonte única (autoridade < 80,
    sem fonte oficial) fica UNVERIFIED e não pode ser selecionada."""
    run = run_pipeline(_settings(tmp_path), mock=True, fixture_path=FIXTURES)

    politics_titles = [s.title.lower() for s in run.verticals["politics"].stories]
    assert not any("zerar imposto" in t for t in politics_titles)

    excluded = [
        c
        for c in run.debug.candidates
        if "zerar imposto" in c.canonical_title.lower() and "excluída" in c.decision
    ]
    assert excluded, "o claim de fonte única deveria aparecer como excluído no debug"


def test_runs_are_reproducible_inputs(tmp_path):
    """Dois runs mock seguidos: o segundo enxerga o primeiro no sinal de novidade."""
    settings = _settings(tmp_path)
    first = run_pipeline(settings, mock=True, fixture_path=FIXTURES)
    second = run_pipeline(settings, mock=True, fixture_path=FIXTURES)

    # mesmos eventos repetidos -> novelty do 2º run deve cair para os clusters repetidos
    first_novelties = {c.canonical_title: c.trend_signals["novelty"] for c in first.debug.clusters}
    second_novelties = {c.canonical_title: c.trend_signals["novelty"] for c in second.debug.clusters}
    common = set(first_novelties) & set(second_novelties)
    assert common
    selected_titles = {s.title for v in first.verticals.values() for s in v.stories}
    repeated = [t for t in common if t in selected_titles]
    assert repeated, "clusters selecionados no 1º run deveriam reaparecer no 2º"
    assert all(second_novelties[t] < first_novelties[t] for t in repeated)
