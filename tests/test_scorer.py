import json

from src.config import EditorialCriterion, LLMBudget, VerticalConfig
from src.editorial.scorer import score_vertical_candidates
from src.llm.base import LLMClient
from src.models import TrendScore
from src.processing.cluster import build_clusters
from src.config import ClusterParams
from tests.conftest import make_article, normalized
from tests.test_llm import FakeProvider

VERTICAL = VerticalConfig(
    id="facts",
    display_name="Fatos",
    description="fatos",
    editorial_criteria=[EditorialCriterion(name="surprise", description="uau")],
)


def _cluster(title: str, domain: str):
    arts = normalized(make_article(title=title, url=f"https://{domain}/x", source_domain=domain))
    return build_clusters(arts, ClusterParams())[0]


def test_semantic_duplicate_flagged_by_llm_is_dropped():
    kept = _cluster("Telescópio Roman da NASA é lançado com sucesso", "nasa.gov")
    dup = _cluster("Roman Telescope promises a new era of cosmic exploration", "space.com")

    response = json.dumps(
        {
            "items": [
                {"index": 0, "sub_scores": {"surprise": 90}, "editorial_score": 88, "reason": "forte"},
                {
                    "index": 1,
                    "sub_scores": {"surprise": 80},
                    "editorial_score": 75,
                    "reason": "mesmo evento do item 0",
                    "duplicate_of_index": 0,
                },
            ]
        }
    )
    llm = LLMClient(primary=FakeProvider("fake", "fake-1", [response]))
    scores, dropped, errors = score_vertical_candidates(
        VERTICAL,
        [(kept, TrendScore(score=70)), (dup, TrendScore(score=60))],
        llm,
        LLMBudget(),
    )

    assert kept.cluster_id in scores
    assert dup.cluster_id not in scores
    assert dropped == {dup.cluster_id: kept.cluster_id}
    assert errors == []


def test_self_or_invalid_duplicate_reference_is_ignored():
    a = _cluster("Estudo revela hábito curioso dos polvos", "nature.com")
    response = json.dumps(
        {
            "items": [
                {
                    "index": 0,
                    "sub_scores": {"surprise": 70},
                    "editorial_score": 70,
                    "reason": "ok",
                    "duplicate_of_index": 99,  # índice inexistente
                }
            ]
        }
    )
    llm = LLMClient(primary=FakeProvider("fake", "fake-1", [response]))
    scores, dropped, _ = score_vertical_candidates(
        VERTICAL, [(a, TrendScore(score=50))], llm, LLMBudget()
    )
    assert a.cluster_id in scores
    assert dropped == {}
