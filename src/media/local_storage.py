"""MediaStorage local (data/media/) — implementação mínima do MVP."""

from __future__ import annotations

import re
from pathlib import Path

from src.media.base import MediaStorage
from src.models import MediaAsset, MediaProvenance

_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(name: str) -> str:
    return _SAFE_RE.sub("_", name).strip("._") or "asset"


class LocalMediaStorage(MediaStorage):
    def __init__(self, base_dir: str | Path = "data/media"):
        self.base_dir = Path(base_dir)

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
        asset = MediaAsset(
            story_id=story_id,
            draft_id=draft_id,
            mime_type=mime_type,
            file_size=len(data),
            provenance=provenance or MediaProvenance(),
        )
        folder = self.base_dir / (story_id or "misc")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{asset.asset_id[:8]}_{_safe_name(filename)}"
        path.write_bytes(data)
        asset.local_path = str(path)
        return asset

    def resolve_path(self, asset: MediaAsset) -> Path:
        return Path(asset.local_path)
