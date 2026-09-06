import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from src.frontpage import build_snapshot, collect, read_json


def feed(ids, title="A headline", domain="https://example.com"):
    return '<rss><channel>' + ''.join(
        f'<item><title>{title} - Outlet</title><link>https://news.google.com/rss/articles/{i}?oc=5</link>'
        f'<guid>{i}</guid><source url="{domain}">Outlet</source><pubDate>Sun, 06 Sep 2026 12:00:00 GMT</pubDate>'
        '</item>' for i in ids) + '</channel></rss>'


class FrontpageTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 6, 14, tzinfo=timezone.utc)

    def test_layout_and_identity_survive_changed_headline(self):
        a, index = build_snapshot(feed(range(34)), self.now)
        b, _ = build_snapshot(feed([1, 0] + list(range(2, 34)), 'Changed headline'), self.now + timedelta(hours=2), index, a)
        self.assertEqual(a['stories'][1]['id'], b['stories'][0]['id'])
        self.assertEqual(b['stories'][0]['rank_change'], 1)
        self.assertEqual(b['stories'][0]['best_rank'], 1)
        self.assertEqual(b['stories'][0]['first_seen'], a['fetched_at'])
        self.assertEqual(b['stats']['new'], 0)
        self.assertEqual(b['stories'][30]['section'], 'health')

    def test_layout_change_preserves_items_without_false_categories(self):
        s, _ = build_snapshot(feed(range(35)), self.now)
        self.assertEqual(len(s['stories']), 35)
        self.assertEqual(s['layout'], 'unknown')
        self.assertTrue(all(x['section'] == 'unclassified' and x['best_rank'] is None for x in s['stories']))

    def test_same_title_different_ids_not_merged(self):
        a, _ = build_snapshot(feed(range(34)), self.now)
        self.assertEqual(len({s['id'] for s in a['stories']}), 34)

    def test_failed_fetch_keeps_latest_and_history_and_records_failure(self):
        with tempfile.TemporaryDirectory() as d:
            a = collect(d, feed(range(34)), self.now)
            with self.assertRaises(ValueError):
                collect(d, '<rss><channel/></rss>', self.now + timedelta(hours=2))
            self.assertEqual(read_json(Path(d) / 'news/latest.json')['id'], a['id'])
            self.assertFalse(read_json(Path(d) / 'news/status.json')['ok'])

    def test_same_slot_is_idempotent_and_archive_is_immutable(self):
        with tempfile.TemporaryDirectory() as d:
            a = collect(d, feed(range(34)), self.now)
            b = collect(d, 'invalid', self.now + timedelta(minutes=10))
            self.assertEqual(a, b)
            c = collect(d, feed(range(1, 35)), self.now + timedelta(hours=2))
            self.assertEqual(c['stats']['new'], 1)
            self.assertEqual(c['stats']['departed'], 1)
            self.assertEqual(len(read_json(Path(d) / 'news/indexes/2026-09.json')), 2)
            archived = read_json(Path(d) / f"news/archive/2026-09/{a['id']}.json")
            self.assertEqual(archived, a)

    def test_return_has_no_misleading_rank_movement(self):
        a, index = build_snapshot(feed(range(34)), self.now)
        b, index = build_snapshot(feed(range(1, 35)), self.now + timedelta(hours=2), index, a)
        c, _ = build_snapshot(feed(range(34)), self.now + timedelta(hours=4), index, b)
        self.assertTrue(c['stories'][0]['returned'])
        self.assertIsNone(c['stories'][0]['rank_change'])


if __name__ == '__main__':
    unittest.main()
