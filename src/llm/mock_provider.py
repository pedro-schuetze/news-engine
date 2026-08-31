"""Provider simulado, determinístico e offline (custo zero).

Usado em `PIPELINE_MODE=mock`, nos testes e no CI. Ele parseia as linhas
estruturadas dos prompts (PURPOSE/ITEM/CRITERIA/VERTICAL/TITLE) e devolve
JSON plausível e estável — a "aleatoriedade" vem de md5 do título, então o
mesmo input produz sempre o mesmo output (PYTHONHASHSEED não interfere).
"""

from __future__ import annotations

import hashlib
import json
import re

from src.llm.base import LLMProvider, LLMResult, LLMUsage

_ITEM_RE = re.compile(
    r"^ITEM (\d+) \|\|\| hint=(\S+) \|\|\| domains=(\d+) \|\|\| langs=(\S*) "
    r"\|\|\| queries=(\d+) \|\|\| title: (.+)$",
    re.MULTILINE,
)

_DISCARD_KW = (
    "horóscopo",
    "horoscopo",
    "promoção",
    "promocao",
    "assine",
    "desconto",
    "cupom",
    "oferta",
    "opinião:",
    "opiniao:",
)
_POLITICS_KW = (
    "tse",
    "eleição",
    "eleicoes",
    "eleições",
    "eleitoral",
    "congresso",
    "senado",
    "câmara",
    "camara",
    "governo",
    "presidente",
    "ministro",
    "stf",
    "partido",
    "campanha",
    "candidato",
)
_ENTERTAINMENT_KW = (
    "filme",
    "série",
    "serie",
    "netflix",
    "show",
    "álbum",
    "album",
    "celebridade",
    "ator",
    "atriz",
    "cantora",
    "cantor",
    "festival",
    "oscar",
    "grammy",
    "bilheteria",
    "streaming",
    "música",
    "musica",
    "turnê",
    "tour",
    "movie",
    "singer",
    "box office",
    "trailer",
)
_FACTS_KW = (
    "cientistas",
    "estudo",
    "descoberta",
    "espaço",
    "espaco",
    "nasa",
    "arqueolog",
    "espécie",
    "especie",
    "planeta",
    "universo",
    "fóssil",
    "fossil",
    "discovery",
    "study",
    "species",
    "scientists",
    "archaeolog",
    "telescope",
    "ancient",
)


def _h(text: str, salt: str = "") -> int:
    return int(hashlib.md5((salt + text).encode("utf-8")).hexdigest(), 16)


def _contains(title: str, keywords: tuple[str, ...]) -> bool:
    low = title.lower()
    return any(k in low for k in keywords)


def _guess_vertical(title: str, hint: str) -> str:
    if _contains(title, _DISCARD_KW):
        return "discard"
    if hint not in ("", "none"):
        return hint
    if _contains(title, _POLITICS_KW):
        return "politics"
    if _contains(title, _ENTERTAINMENT_KW):
        return "entertainment"
    if _contains(title, _FACTS_KW):
        return "facts"
    return "discard"


def _guess_content_type(title: str, vertical: str) -> str:
    low = title.lower()
    if "pesquisa" in low and ("eleit" in low or "votos" in low or "intenção" in low):
        return "POLL"
    if any(k in low for k in ("rumor", "affair", "suposto", "suposta", "estaria")):
        return "RUMOR"
    if any(k in low for k in ("afirma", "diz que", "declara", "promete", "nega")):
        return "CLAIM"
    if vertical == "politics" and any(
        k in low for k in ("aprova", "decide", "decisão", "decisao", "resolução", "resolucao", "sanciona")
    ):
        return "OFFICIAL_DECISION"
    if low.startswith(("opinião", "opiniao", "artigo:")):
        return "OPINION"
    return "FACT"


class MockProvider(LLMProvider):
    name = "mock"
    model = "mock-editor-v1"

    def complete(
        self, *, system: str, user: str, max_output_tokens: int, json_only: bool = True
    ) -> LLMResult:
        purpose_match = re.search(r"^PURPOSE: (\w+)", user, re.MULTILINE)
        purpose = purpose_match.group(1) if purpose_match else ""

        if purpose == "classification":
            payload = self._classification(user)
        elif purpose == "editorial_score":
            payload = self._editorial(user)
        elif purpose == "draft":
            payload = self._draft(user)
        else:
            payload = {"error": f"mock não reconhece purpose '{purpose}'"}

        text = json.dumps(payload, ensure_ascii=False)
        usage = LLMUsage(
            input_tokens=len(user) // 4, output_tokens=len(text) // 4, source="estimate"
        )
        return LLMResult(text=text, usage=usage, provider=self.name, model=self.model)

    # ── purposes ─────────────────────────────────────────────────────

    def _classification(self, user: str) -> dict:
        verticals = ["entertainment", "politics", "facts"]
        out = []
        for m in _ITEM_RE.finditer(user):
            index, hint, _domains, _langs, _queries, title = m.groups()
            primary = _guess_vertical(title, hint)
            h = _h(title)
            scores = {v: 15 + _h(title, v) % 30 for v in verticals}
            if primary in scores:
                scores[primary] = 78 + h % 18
            reason = (
                "Mock: descartado por heurística de palavras-chave."
                if primary == "discard"
                else f"Mock: classificado como {primary} por hint/palavras-chave."
            )
            out.append(
                {
                    "index": int(index),
                    "primary_vertical": primary,
                    "vertical_scores": scores,
                    "confidence": round(0.55 + (h % 40) / 100, 2),
                    "reason": reason,
                    "content_type": _guess_content_type(title, primary),
                    "duplicate_of_index": None,
                }
            )
        return {"classifications": out}

    def _editorial(self, user: str) -> dict:
        criteria_match = re.search(r"^CRITERIA: (.+)$", user, re.MULTILINE)
        criteria = (
            [c.strip() for c in criteria_match.group(1).split(",") if c.strip()]
            if criteria_match
            else ["importance"]
        )
        items = []
        for m in _ITEM_RE.finditer(user):
            index, _hint, domains, _langs, _queries, title = m.groups()
            h = _h(title)
            base = 25 if _contains(title, _DISCARD_KW) else 52 + h % 38
            content_type = _guess_content_type(title, "")
            is_claim = content_type in ("CLAIM", "RUMOR")
            sub = {
                c: max(0, min(100, base + (_h(title, c) % 15) - 7)) for c in criteria
            }
            items.append(
                {
                    "index": int(index),
                    "sub_scores": sub,
                    "editorial_score": base,
                    "reason": "Mock: avaliação determinística simulada (hash do título).",
                    "red_flags": (["alegação sem confirmação independente"] if is_claim else []),
                    "is_rumor_or_claim": is_claim,
                    "claim_attribution": ("segundo a fonte que noticiou" if is_claim else ""),
                    "verification_notes": f"Mock: {domains} domínio(s) independente(s) no cluster.",
                    "contradictions": [],
                    "content_type": content_type,
                }
            )
        return {"items": items}

    def _draft(self, user: str) -> dict:
        title_match = re.search(r"^TITLE: (.+)$", user, re.MULTILINE)
        vertical_match = re.search(r"^VERTICAL: (\w+)$", user, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else "Acontecimento do dia"
        vertical = vertical_match.group(1) if vertical_match else "facts"

        tags = {
            "entertainment": ["#entretenimento", "#cultura", "#famosos"],
            "politics": ["#politica", "#eleicoes2026", "#brasil"],
            "facts": ["#curiosidades", "#ciencia", "#vocesabia"],
        }.get(vertical, ["#noticias"])

        short_title = title if len(title) <= 60 else title[:57].rstrip() + "..."
        slides = [
            {
                "slide_number": 1,
                "role": "HOOK",
                "headline": short_title,
                "body": "Entenda em 5 slides o que aconteceu e por que importa.",
                "image_direction": f"Imagem forte e direta relacionada a: {title}.",
                "image_source_type": "AGENCY_PHOTO",
            },
            {
                "slide_number": 2,
                "role": "CONTEXT",
                "headline": "O contexto",
                "body": f"[MOCK] Contexto resumido do acontecimento: {title}.",
                "image_direction": "Foto de contexto do assunto, plano aberto.",
                "image_source_type": "AGENCY_PHOTO",
            },
            {
                "slide_number": 3,
                "role": "FACTS",
                "headline": "O que se sabe",
                "body": "[MOCK] Fato 1; fato 2; fato 3 — extraídos das fontes do cluster.",
                "image_direction": "Foto/desdobramento principal citado nas fontes.",
                "image_source_type": "AGENCY_PHOTO",
            },
            {
                "slide_number": 4,
                "role": "WHY_IT_MATTERS",
                "headline": "Por que importa",
                "body": "[MOCK] O impacto prático disso para o público da vertical.",
                "image_direction": "Ilustração conceitual do impacto (arte limpa).",
                "image_source_type": "ILLUSTRATION",
            },
            {
                "slide_number": 5,
                "role": "CONCLUSION",
                "headline": "O que vem agora",
                "body": "[MOCK] Próximos passos esperados. Siga para acompanhar.",
                "image_direction": "Imagem de fechamento coerente com o tema.",
                "image_source_type": "AGENCY_PHOTO",
            },
        ]
        return {
            "original_story_title": title,
            "instagram_headline": short_title,
            "short_summary": f"[MOCK] Resumo em 2 frases de: {title}.",
            "why_it_matters": "[MOCK] Por que este acontecimento é relevante para a audiência.",
            "key_facts": [
                "[MOCK] Fato-chave 1",
                "[MOCK] Fato-chave 2",
                "[MOCK] Fato-chave 3",
            ],
            "caption": (
                f"{short_title}\n\n[MOCK] Caption simulada com 2-3 frases sobre o acontecimento. "
                "Siga para mais notícias como essa."
            ),
            "hashtags": tags,
            "slides": slides,
        }
