"""Abstração de armazenamento de mídia.

O MVP não gera nem baixa imagens — esta camada existe porque JÁ SABEMOS que
haverá substituição futura (Supabase Storage ou Cloudflare R2) e o modelo
MediaAsset precisa nascer com provenance/direitos de uso.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from src.models import MediaAsset, MediaProvenance


class MediaStorage(ABC):
    @abstractmethod
    def save_bytes(
        self,
        data: bytes,
        *,
        filename: str,
        story_id: str = "",
        draft_id: str | None = None,
        mime_type: str = "application/octet-stream",
        provenance: MediaProvenance | None = None,
    ) -> MediaAsset:
        """Persiste o binário e retorna o MediaAsset com caminho + provenance."""

    @abstractmethod
    def resolve_path(self, asset: MediaAsset) -> Path:
        """Caminho local legível do asset (para preview/render)."""
