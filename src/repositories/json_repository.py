"""Implementação MVP do NewsRepository em arquivos JSON.

Layout:
  data/latest.json                     -> cópia do run mais recente
  data/runs/YYYY-MM-DD_HHMMSS.json     -> um arquivo por run (timestamp local)
  data/reviews/<story_id>.json         -> uma review por story

Escrita atômica (tmp + os.replace) para nunca deixar JSON pela metade.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from src.models import PipelineRun, Review, Story
from src.repositories.base import NewsRepository, RunSummary

log = logging.getLogger("news_engine.repo")


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


class JsonNewsRepository(NewsRepository):
    def __init__(self, data_dir: str | Path = "data", timezone: str = "America/Sao_Paulo"):
        self.data_dir = Path(data_dir)
        self.runs_dir = self.data_dir / "runs"
        self.reviews_dir = self.data_dir / "reviews"
        self.tz = ZoneInfo(timezone)

    # ── runs ─────────────────────────────────────────────────────────

    def save_run(self, run: PipelineRun) -> str:
        payload = json.dumps(run.model_dump(mode="json"), ensure_ascii=False, indent=2)
        local_ts = run.started_at.astimezone(self.tz)
        run_path = self.runs_dir / f"{local_ts:%Y-%m-%d_%H%M%S}.json"
        _atomic_write(run_path, payload)
        _atomic_write(self.data_dir / "latest.json", payload)
        return str(run_path)

    def _load(self, path: Path) -> PipelineRun | None:
        try:
            return PipelineRun.model_validate(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, ValidationError) as e:
            log.warning("[repo] run ilegível em %s: %s", path, e)
            return None

    def get_latest_run(self) -> PipelineRun | None:
        path = self.data_dir / "latest.json"
        return self._load(path) if path.exists() else None

    def _run_files(self) -> list[Path]:
        if not self.runs_dir.exists():
            return []
        return sorted(self.runs_dir.glob("*.json"), reverse=True)

    def get_run(self, run_id: str) -> PipelineRun | None:
        latest = self.get_latest_run()
        if latest and latest.run_id == run_id:
            return latest
        for path in self._run_files():
            run = self._load(path)
            if run and run.run_id == run_id:
                return run
        return None

    def list_runs(self, limit: int = 30) -> list[RunSummary]:
        out: list[RunSummary] = []
        for path in self._run_files()[:limit]:
            run = self._load(path)
            if run is None:
                continue
            out.append(
                RunSummary(
                    run_id=run.run_id,
                    started_at=run.started_at,
                    mode=run.mode,
                    stories_selected=run.stats.stories_selected,
                    path=str(path),
                )
            )
        return out

    # ── stories ──────────────────────────────────────────────────────

    def list_stories(self, run_id: str | None = None) -> list[Story]:
        run = self.get_run(run_id) if run_id else self.get_latest_run()
        if run is None:
            return []
        return [s for vr in run.verticals.values() for s in vr.stories]

    def get_story(self, story_id: str) -> Story | None:
        latest = self.get_latest_run()
        seen_run_ids = set()
        candidates = [latest] if latest else []
        for path in self._run_files()[:10]:
            run = self._load(path)
            if run:
                candidates.append(run)
        for run in candidates:
            if run.run_id in seen_run_ids:
                continue
            seen_run_ids.add(run.run_id)
            for vr in run.verticals.values():
                for story in vr.stories:
                    if story.story_id == story_id:
                        return story
        return None

    # ── reviews ──────────────────────────────────────────────────────

    def save_review(self, review: Review) -> None:
        payload = json.dumps(review.model_dump(mode="json"), ensure_ascii=False, indent=2)
        _atomic_write(self.reviews_dir / f"{review.story_id}.json", payload)

    def get_review(self, story_id: str) -> Review | None:
        path = self.reviews_dir / f"{story_id}.json"
        if not path.exists():
            return None
        try:
            return Review.model_validate(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, ValidationError) as e:
            log.warning("[repo] review ilegível em %s: %s", path, e)
            return None

    def list_reviews(self) -> dict[str, Review]:
        if not self.reviews_dir.exists():
            return {}
        out: dict[str, Review] = {}
        for path in self.reviews_dir.glob("*.json"):
            try:
                review = Review.model_validate(json.loads(path.read_text(encoding="utf-8")))
                out[review.story_id] = review
            except (OSError, json.JSONDecodeError, ValidationError):
                continue
        return out

    # ── sinais históricos ────────────────────────────────────────────

    def previous_story_titles(self, n_runs: int = 3) -> list[str]:
        titles: list[str] = []
        for path in self._run_files()[:n_runs]:
            run = self._load(path)
            if run is None:
                continue
            for vr in run.verticals.values():
                titles.extend(s.title for s in vr.stories)
        return titles
