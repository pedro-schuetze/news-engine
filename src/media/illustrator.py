"""Geração da ilustração de cada post, no fim do run.

Por que aqui e não no dashboard: gerar sob demanda fazia a primeira abertura
de um post levar ~60s e não dava para prever o custo. Gerando no run, o
dashboard abre instantâneo, o custo fica travado em 1 imagem por post e o
arquivo entra no repositório junto com o JSON (auditável, versionado).

A imagem também é analisada com Pillow: descobrimos em qual faixa há mais
espaço escuro e uniforme, e o renderer usa isso para colocar o texto onde o
contraste é melhor, em vez de sempre no mesmo lugar.

Regras de conteúdo (mesmas do projeto): nunca retratar pessoa real
identificável, nunca texto/logo dentro da arte — só cenário, objeto, símbolo.
"""

from __future__ import annotations

import base64
import io
import logging
import time
from typing import Optional

from src.config import Settings, estimate_image_cost_usd
from src.media.base import MediaStorage
from src.models import (
    AssetSourceType,
    MediaAsset,
    MediaProvenance,
    Story,
    TextPlacement,
)

log = logging.getLogger("news_engine.media")

# clima visual por vertical — o prompt descreve a CENA, nunca pessoas
VERTICAL_MOOD: dict[str, str] = {
    "politics": (
        "sober photojournalistic still life about institutions and democracy: "
        "empty debate stage, ballot boxes, marble columns, official documents, "
        "microphones on an empty table; muted blues and deep neutrals"
    ),
    "entertainment": (
        "cinematic pop-culture atmosphere: stage lights over an empty venue, film "
        "reels, vinyl records, concert haze, red curtain; saturated color, dramatic "
        "contrast"
    ),
    "facts": (
        "scientific wonder: macro textures, cosmic or natural phenomena, laboratory "
        "glass, deep space, microscopic detail; deep blues and violets"
    ),
}

STYLE = (
    "Style: editorial photography, cinematic, atmospheric, slightly abstract, "
    "shallow depth of field, dramatic directional light, rich shadows. "
    "Composition: keep the top and bottom thirds visually calm and dark so large "
    "text can be overlaid."
)

HARD_RULES = (
    "STRICT: no text, no letters, no numbers, no logos, no watermarks, no signage. "
    "STRICT: no recognizable real person, no identifiable face, no portrait, no "
    "celebrity likeness. Use objects, environments, silhouettes or symbols instead."
)


def build_prompt(story: Story) -> str:
    """Prompt da ilustração: tema da story + clima da vertical + travas."""
    mood = VERTICAL_MOOD.get(story.vertical, "documentary photography, neutral tones")
    # a direção visual do slide de abertura, quando existe, ancora a cena
    direction = ""
    if story.draft and story.draft.slides:
        direction = (story.draft.slides[0].image_direction or "").strip()
    parts = [
        f'Editorial illustration for a news carousel about: "{story.title}".',
        f"Visual direction: {mood}.",
    ]
    if direction:
        parts.append(f"Scene hint (do not include people): {direction}")
    parts += [STYLE, HARD_RULES]
    return " ".join(parts)


def analyze_placement(image_bytes: bytes) -> tuple[TextPlacement, str]:
    """Escolhe a faixa e o alinhamento com mais contraste para texto branco.

    Divide a imagem em 3 faixas horizontais e 3 colunas, e prefere a região
    mais escura e mais uniforme (baixo desvio = menos detalhe competindo com
    a tipografia). Se o Pillow não estiver disponível, cai no padrão.
    """
    try:
        from PIL import Image, ImageStat
    except ImportError:  # pragma: no cover - Pillow está no requirements
        return TextPlacement.BOTTOM, "center"

    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            gray = im.convert("L")
            w, h = gray.size

            def score(box: tuple[int, int, int, int]) -> float:
                stat = ImageStat.Stat(gray.crop(box))
                mean = stat.mean[0]
                stddev = stat.stddev[0]
                # quanto menor a luminância e menor a variação, melhor
                return mean + 0.6 * stddev

            bands = {
                TextPlacement.TOP: (0, 0, w, h // 3),
                TextPlacement.CENTER: (0, h // 3, w, 2 * h // 3),
                TextPlacement.BOTTOM: (0, 2 * h // 3, w, h),
            }
            placement = min(bands, key=lambda k: score(bands[k]))

            band_box = bands[placement]
            thirds = {
                "left": (0, band_box[1], w // 3, band_box[3]),
                "center": (w // 3, band_box[1], 2 * w // 3, band_box[3]),
                "right": (2 * w // 3, band_box[1], w, band_box[3]),
            }
            scores = {k: score(v) for k, v in thirds.items()}
            best = min(scores, key=lambda k: scores[k])
            # só desloca o texto quando o ganho é claro; senão mantém centralizado
            align = best if scores[best] < scores["center"] - 12 else "center"
            return placement, align
    except Exception as e:  # imagem corrompida não pode derrubar o run
        log.warning("[media] análise de contraste falhou: %s", e)
        return TextPlacement.BOTTOM, "center"


def compress(image_bytes: bytes, max_width: int = 1080, quality: int = 82) -> tuple[bytes, int, int]:
    """PNG de ~1MB da API vira JPEG de ~150-250KB (o repositório agradece)."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover
        return image_bytes, 0, 0
    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            im = im.convert("RGB")
            if im.width > max_width:
                ratio = max_width / im.width
                im = im.resize((max_width, int(im.height * ratio)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
            return buf.getvalue(), im.width, im.height
    except Exception as e:
        log.warning("[media] compressão falhou, mantendo original: %s", e)
        return image_bytes, 0, 0


class IllustrationError(Exception):
    pass


def generate_illustration(
    story: Story,
    settings: Settings,
    storage: MediaStorage,
    *,
    timeout: float = 120.0,
) -> Optional[MediaAsset]:
    """Gera, comprime, analisa e salva a ilustração. None se falhar."""
    if not settings.openai_api_key:
        log.warning("[media] sem OPENAI_API_KEY: ilustração não gerada")
        return None

    try:
        from openai import OpenAI
    except ImportError:  # pragma: no cover
        log.warning("[media] pacote openai ausente")
        return None

    prompt = build_prompt(story)
    client = OpenAI(api_key=settings.openai_api_key, timeout=timeout, max_retries=1)
    t0 = time.monotonic()
    try:
        resp = client.images.generate(
            model=settings.openai_image_model,
            prompt=prompt,
            size=settings.openai_image_size,
            quality=settings.openai_image_quality,
            n=1,
        )
    except Exception as e:
        log.warning("[media] geração falhou para '%s': %s", story.title[:50], str(e)[:180])
        return None

    item = resp.data[0]
    if not item.b64_json:
        log.warning("[media] resposta sem imagem para '%s'", story.title[:50])
        return None
    raw = base64.b64decode(item.b64_json)

    out_tokens = getattr(getattr(resp, "usage", None), "output_tokens", 0) or 0
    cost = estimate_image_cost_usd(settings.openai_image_model, out_tokens)

    data, width, height = compress(raw)
    placement, align = analyze_placement(data)

    asset = storage.save_bytes(
        data,
        filename=f"{story.vertical}.jpg",
        story_id=story.story_id,
        draft_id=story.draft.draft_id if story.draft else None,
        mime_type="image/jpeg",
        provenance=MediaProvenance(
            source_type=AssetSourceType.GENERATED,
            source_name=settings.openai_image_model,
            license="gerada por IA para uso editorial próprio",
            attribution_required=True,
            attribution_text="ILUSTRAÇÃO GERADA POR IA",
        ),
    )
    asset.width = width or None
    asset.height = height or None
    asset.text_placement = placement
    asset.text_align = align
    asset.prompt = prompt
    asset.estimated_cost_usd = round(cost, 4) if cost is not None else None

    log.info(
        "[media] %s: %dKB · texto em %s/%s · %.0fs · %s",
        story.title[:44],
        len(data) // 1024,
        placement.value.lower(),
        align,
        time.monotonic() - t0,
        f"US$ {cost:.4f}" if cost else "custo n/d",
    )
    return asset
