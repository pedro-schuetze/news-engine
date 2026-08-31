from datetime import timezone

from src.models import PipelineRun, Review, ReviewStatus, RunStats, Story, VerticalResult
from src.repositories.json_repository import JsonNewsRepository
from tests.conftest import NOW


def _run(title: str = "TSE aprova resolução") -> PipelineRun:
    story = Story(vertical="politics", title=title, final_score=80.0)
    return PipelineRun(
        mode="mock",
        started_at=NOW,
        lookback_hours=18,
        stats=RunStats(stories_selected=1),
        verticals={"politics": VerticalResult(vertical="politics", stories=[story])},
    )


def test_save_and_load_run(tmp_path):
    repo = JsonNewsRepository(tmp_path, "America/Sao_Paulo")
    run = _run()
    path = repo.save_run(run)
    assert (tmp_path / "latest.json").exists()
    assert "runs" in path

    loaded = repo.get_latest_run()
    assert loaded is not None
    assert loaded.run_id == run.run_id
    assert loaded.verticals["politics"].stories[0].title == "TSE aprova resolução"
    # datas continuam timezone-aware
    assert loaded.started_at.tzinfo is not None
    assert loaded.started_at.astimezone(timezone.utc) == NOW

    assert repo.get_run(run.run_id) is not None
    assert repo.get_run("inexistente") is None

    summaries = repo.list_runs()
    assert len(summaries) == 1
    assert summaries[0].run_id == run.run_id
    assert summaries[0].stories_selected == 1


def test_list_stories_and_get_story(tmp_path):
    repo = JsonNewsRepository(tmp_path, "America/Sao_Paulo")
    run = _run()
    repo.save_run(run)
    stories = repo.list_stories()
    assert len(stories) == 1
    sid = stories[0].story_id
    assert repo.get_story(sid) is not None
    assert repo.get_story("nao-existe") is None


def test_reviews_roundtrip(tmp_path):
    repo = JsonNewsRepository(tmp_path, "America/Sao_Paulo")
    review = Review(story_id="abc-123", review_status=ReviewStatus.APPROVED, reviewed_at=NOW)
    repo.save_review(review)
    loaded = repo.get_review("abc-123")
    assert loaded is not None
    assert loaded.review_status == ReviewStatus.APPROVED

    # sobrescrita muda o status
    repo.save_review(Review(story_id="abc-123", review_status=ReviewStatus.REJECTED))
    assert repo.get_review("abc-123").review_status == ReviewStatus.REJECTED
    assert set(repo.list_reviews().keys()) == {"abc-123"}


def test_previous_story_titles(tmp_path):
    repo = JsonNewsRepository(tmp_path, "America/Sao_Paulo")
    repo.save_run(_run("Título anterior importante"))
    titles = repo.previous_story_titles(3)
    assert titles == ["Título anterior importante"]


def test_missing_data_dir_is_graceful(tmp_path):
    repo = JsonNewsRepository(tmp_path / "nao-existe", "America/Sao_Paulo")
    assert repo.get_latest_run() is None
    assert repo.list_runs() == []
    assert repo.list_reviews() == {}
    assert repo.previous_story_titles() == []
