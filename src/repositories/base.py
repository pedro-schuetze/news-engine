"""Interface de persistência (NewsRepository).

O pipeline e o dashboard dependem APENAS desta interface — trocar JSON por
Supabase/Postgres no futuro significa escrever outra implementação, sem
tocar no pipeline (docs/architecture/persistence.md).

Nota de design: no MVP o run é um documento único (articles/clusters/stories
embutidos + debug), então não há save_articles/save_clusters separados —
uma implementação SQL futura normalizará essas entidades em tabelas e este
contrato pode ganhar métodos granulares nessa hora, não antes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from src.models import PipelineRun, Review, Story


@dataclass
class RunSummary:
    run_id: str
    started_at: datetime
    mode: str
    stories_selected: int
    path: str


class NewsRepository(ABC):
    @abstractmethod
    def save_run(self, run: PipelineRun) -> str:
        """Persiste o run completo; retorna o caminho/identificador salvo."""

    @abstractmethod
    def get_latest_run(self) -> PipelineRun | None: ...

    @abstractmethod
    def get_run(self, run_id: str) -> PipelineRun | None: ...

    @abstractmethod
    def list_runs(self, limit: int = 30) -> list[RunSummary]: ...

    @abstractmethod
    def list_stories(self, run_id: str | None = None) -> list[Story]:
        """Stories selecionadas do run dado (ou do mais recente)."""

    @abstractmethod
    def get_story(self, story_id: str) -> Story | None: ...

    @abstractmethod
    def save_review(self, review: Review) -> None: ...

    @abstractmethod
    def get_review(self, story_id: str) -> Review | None: ...

    @abstractmethod
    def list_reviews(self) -> dict[str, Review]:
        """story_id -> Review (todas as reviews persistidas)."""

    @abstractmethod
    def previous_story_titles(self, n_runs: int = 3) -> list[str]:
        """Títulos das stories dos últimos runs — usado no sinal de novidade."""
