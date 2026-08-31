from datetime import timedelta

from src.config import RankingConfig, load_ranking
from src.models import Story, VerificationStatus
from src.processing.cluster import build_clusters
from src.processing.ranking import compute_final_score, compute_trend_score, select_stories
from tests.conftest import NOW, make_article, normalized

CFG = load_ranking("config")  # valida também o YAML real do repo


def _cluster(n_domains: int, hours_ago: float = 2.0, title: str = "Evento X acontece"):
    arts = [
        make_article(
            title=f"{title} segundo veículo {i}",
            url=f"https://dom{i}.com/x",
            source_domain=f"dom{i}.com",
            published_at=NOW - timedelta(hours=hours_ago + i * 0.2),
        )
        for i in range(n_domains)
    ]
    clusters = build_clusters(normalized(*arts), CFG.cluster)
    assert len(clusters) == 1, "artigos do helper deveriam clusterizar juntos"
    return clusters[0]


class TestTrendScore:
    def test_more_domains_scores_higher(self):
        low = compute_trend_score(_cluster(1), CFG, {}, NOW, [])
        high = compute_trend_score(_cluster(4), CFG, {}, NOW, [])
        assert high.score > low.score

    def test_recency_decay(self):
        fresh = compute_trend_score(_cluster(2, hours_ago=1), CFG, {}, NOW, [])
        old = compute_trend_score(_cluster(2, hours_ago=15), CFG, {}, NOW, [])
        assert fresh.signals["recency"] > old.signals["recency"]
        assert fresh.score > old.score

    def test_novelty_penalizes_repeated_story(self):
        cluster = _cluster(2, title="TSE aprova resolução sobre propaganda")
        fresh = compute_trend_score(cluster, CFG, {}, NOW, ["Assunto totalmente diferente"])
        repeated = compute_trend_score(
            cluster, CFG, {}, NOW, ["TSE aprova resolução sobre propaganda eleitoral"]
        )
        assert repeated.signals["novelty"] < fresh.signals["novelty"]
        assert repeated.score < fresh.score

    def test_authority_signal_uses_map(self):
        cluster = _cluster(2)
        weak = compute_trend_score(cluster, CFG, {}, NOW, [])
        strong = compute_trend_score(
            cluster, CFG, {d: 95 for d in cluster.domains}, NOW, []
        )
        assert strong.signals["authority"] > weak.signals["authority"]

    def test_score_bounded_0_100(self):
        t = compute_trend_score(_cluster(6, hours_ago=0.1), CFG, {}, NOW, [])
        assert 0 <= t.score <= 100

    def test_weights_are_normalized(self):
        assert abs(sum(CFG.trend.weights.values()) - 1.0) < 1e-9


class TestFinalScore:
    def test_blend_formula_explicit(self):
        cfg = RankingConfig()  # defaults: 0.40/0.60
        final, excluded, notes = compute_final_score(
            "qualquer", 50.0, 80, VerificationStatus.VERIFIED, cfg
        )
        assert final == 0.40 * 50 + 0.60 * 80
        assert not excluded
        assert notes

    def test_politics_unverified_is_excluded(self):
        final, excluded, _ = compute_final_score(
            "politics", 70.0, 90, VerificationStatus.UNVERIFIED, CFG
        )
        assert excluded is True

    def test_unverified_penalty_default(self):
        cfg = RankingConfig()
        ok, _, _ = compute_final_score("x", 50.0, 80, VerificationStatus.VERIFIED, cfg)
        pen, excluded, _ = compute_final_score("x", 50.0, 80, VerificationStatus.UNVERIFIED, cfg)
        assert not excluded
        assert ok - pen == cfg.verification_default.unverified_penalty


def _story(score: float) -> Story:
    return Story(vertical="facts", title=f"story {score}", final_score=score)


class TestSelection:
    def test_threshold_and_quota(self):
        stories = [_story(s) for s in (90, 80, 70, 60, 58, 56, 40)]
        selected, insufficient, _ = select_stories(stories, 3, 5, 55.0)
        assert [s.final_score for s in selected] == [90, 80, 70, 60, 58]
        assert insufficient is False
        assert [s.selection_rank for s in selected] == [1, 2, 3, 4, 5]

    def test_never_fills_quota_with_bad_stories(self):
        stories = [_story(s) for s in (90, 52, 40)]
        selected, insufficient, _ = select_stories(stories, 3, 5, 55.0)
        assert len(selected) == 1
        assert insufficient is True
