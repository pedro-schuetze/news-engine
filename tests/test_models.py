import json

import pytest
from pydantic import ValidationError

from src.models import (
    CarouselSlide,
    ClassificationItem,
    DraftOutput,
    DraftSlideOutput,
    ImageSourceType,
    PipelineRun,
    RunStats,
    SlideRole,
    Story,
    VerticalResult,
)


class TestClamping:
    def test_scores_clamped_0_100(self):
        item = ClassificationItem(
            index=0,
            primary_vertical="POLITICS",
            vertical_scores={"politics": 150, "facts": -10},
            confidence=3.5,
        )
        assert item.vertical_scores == {"politics": 100, "facts": 0}
        assert item.confidence == 1.0
        assert item.primary_vertical == "politics"  # normalizado p/ minúsculas

    def test_invalid_content_type_becomes_none(self):
        item = ClassificationItem(index=0, content_type="BANANA")
        assert item.content_type is None

    def test_unknown_slide_role_becomes_other(self):
        slide = CarouselSlide(role="INTRO_MALUCA", image_source_type="FOTO_QUALQUER")
        assert slide.role == SlideRole.OTHER
        assert slide.image_source_type == ImageSourceType.OTHER


class TestDraftOutput:
    def _slides(self, n: int):
        return [
            DraftSlideOutput(slide_number=i + 1, role="HOOK", headline="h", body="b")
            for i in range(n)
        ]

    def test_slide_count_validated(self):
        with pytest.raises(ValidationError):
            DraftOutput(slides=self._slides(2))
        assert len(DraftOutput(slides=self._slides(5)).slides) == 5

    def test_headline_truncada_rejeitada(self):
        # caso real de produção (2026-09-02): a manchete veio só "EUA prometem"
        with pytest.raises(ValidationError):
            DraftOutput(slides=self._slides(5), instagram_headline="EUA prometem")
        ok = DraftOutput(
            slides=self._slides(5),
            instagram_headline='EUA prometem "atingir o Irã com força", diz Trump',
        )
        assert ok.instagram_headline.endswith("Trump")

    def test_hashtags_normalized(self):
        d = DraftOutput(slides=self._slides(5), hashtags=["politica", "#brasil", " eleições "])
        assert d.hashtags == ["#politica", "#brasil", "#eleições"]

    def test_to_draft_renumbers_slides(self):
        d = DraftOutput(
            slides=[
                DraftSlideOutput(slide_number=9, role="HOOK", headline="a", body="b"),
                DraftSlideOutput(slide_number=1, role="CONTEXT", headline="c", body="d"),
                DraftSlideOutput(slide_number=7, role="FACTS", headline="e", body="f"),
            ]
        )
        draft = d.to_draft("story-1")
        assert [s.slide_number for s in draft.slides] == [1, 2, 3]
        assert draft.story_id == "story-1"


class TestSerialization:
    def test_pipeline_run_json_roundtrip(self):
        run = PipelineRun(
            mode="mock",
            lookback_hours=18,
            stats=RunStats(articles_collected=10, estimated_llm_cost_usd=0.0123),
            verticals={
                "facts": VerticalResult(
                    vertical="facts",
                    stories=[Story(vertical="facts", title="Polvos sonham", final_score=77.5)],
                )
            },
        )
        payload = json.dumps(run.model_dump(mode="json"), ensure_ascii=False)
        restored = PipelineRun.model_validate(json.loads(payload))
        assert restored.run_id == run.run_id
        assert restored.verticals["facts"].stories[0].title == "Polvos sonham"
        assert restored.verticals["facts"].stories[0].final_score == 77.5
        assert restored.started_at == run.started_at
