"""Google News BR snapshots. Standard library only; no article scraping or LLM.

Section boundaries are an observed RSS layout, not Google metadata. If the
layout changes, keep every item and mark it unclassified rather than guess.
Identity uses shared Google item/article identifiers, never fuzzy headlines.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

FEED = "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt"
SECTIONS = [("top", "Top stories", 6), ("brazil", "Brazil", 4),
            ("world", "World", 4), ("business", "Business", 4),
            ("technology", "Technology", 4), ("entertainment", "Entertainment", 4),
            ("sports", "Sports", 4), ("health", "Health", 4)]


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_url(url):
    p = urlsplit(url or "")
    return url if p.scheme in ("http", "https") and p.hostname else ""


def key(url):
    p = urlsplit(url)
    return f"{p.hostname}{p.path}"  # tracking parameters are not identity


class Outlets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.field = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "li":
            self.row = {"title": "", "name": "", "url": ""}
        if self.row is not None:
            if tag == "a":
                self.field = "title"
                self.row["url"] = safe_url(attrs.get("href", ""))
            elif tag == "font":
                self.field = "name"

    def handle_data(self, data):
        if self.row is not None and self.field:
            self.row[self.field] += data

    def handle_endtag(self, tag):
        if tag in ("a", "font"):
            self.field = None
        if tag == "li" and self.row is not None:
            row = {k: v.strip() for k, v in self.row.items()}
            if row["url"] and row["title"]:
                self.rows.append(row)
            self.row = None
            self.field = None


def parse_feed(xml):
    root = ET.fromstring(xml)
    items = root.findall("./channel/item")
    if not items:
        raise ValueError("Google News returned no stories; previous snapshot preserved.")
    observed_layout = len(items) == 34
    slots = [(sid, label, rank) for sid, label, count in SECTIONS for rank in range(1, count + 1)]
    out = []
    for i, item in enumerate(items):
        title = (item.findtext("title") or "").strip()
        url = safe_url(item.findtext("link") or "")
        if not title or not url:
            raise ValueError("A feed item has no valid title/link; previous snapshot preserved.")
        source = item.find("source")
        source_name = source.text if source is not None and source.text else "Unknown outlet"
        source_url = source.get("url", "") if source is not None else ""
        domain = urlsplit(source_url).hostname or ""
        parser = Outlets()
        parser.feed(item.findtext("description") or "")
        articles = parser.rows or [{"title": title, "name": source_name, "url": url}]
        # Only the main source domain is supplied by the RSS, no invented mapping.
        for a in articles:
            a["domain"] = domain.removeprefix("www.") if a["name"] == source_name else ""
        articles = list({key(a["url"]): a for a in articles}.values())
        if title.endswith(" - " + source_name):
            title = title[:-(len(source_name) + 3)]
        published = None
        try:
            published = iso(parsedate_to_datetime(item.findtext("pubDate") or ""))
        except (ValueError, TypeError, OverflowError):
            pass
        sid, label, rank = slots[i] if observed_layout else ("unclassified", "Unclassified", i + 1)
        aliases = sorted(set([key(url)] + [key(a["url"]) for a in articles]))
        out.append({"title": title, "url": url, "guid": item.findtext("guid") or key(url),
                    "published_at": published, "section": sid, "section_label": label,
                    "rank": rank, "feed_position": i + 1, "outlets": articles, "aliases": aliases})
    warnings = ["Sections inferred from the observed 34-item feed layout; Google supplies no section labels."]
    if not observed_layout:
        warnings = [f"Feed layout changed ({len(items)} items). All stories kept as Unclassified; section ranks unavailable."]
    return out, warnings, "observed-layout" if observed_layout else "unknown"


def build_snapshot(xml, now, identities=None, previous=None):
    stories, warnings, layout = parse_feed(xml)
    identities = json.loads(json.dumps(identities or {}))
    alias_map = {}
    for sid, record in identities.items():
        for alias in record["aliases"]:
            alias_map.setdefault(alias, set()).add(sid)
    prev = {s["id"]: s for s in (previous or {}).get("stories", [])}
    seen = set()
    result = []
    for s in stories:
        candidates = set().union(*(alias_map.get(a, set()) for a in s["aliases"]))
        sid = next(iter(candidates)) if len(candidates) == 1 else "gn-" + hashlib.sha256(s["guid"].encode()).hexdigest()[:24]
        if len(candidates) > 1:
            warnings.append("Ambiguous story identity; prior histories were not merged.")
        if sid in seen:
            # Same event appearing in two sections remains two placements, one identity.
            pass
        seen.add(sid)
        old = identities.get(sid)
        previous_story = prev.get(sid)
        best_by_section = dict((old or {}).get("best_by_section", {}))
        if layout != "unknown":
            best_by_section[s["section"]] = min(best_by_section.get(s["section"], s["rank"]), s["rank"])
        aliases = sorted(set(s.pop("aliases") + (old or {}).get("aliases", [])))
        first = old["first_seen"] if old else iso(now)
        identities[sid] = {"first_seen": first, "last_seen": iso(now), "aliases": aliases,
                           "best_by_section": best_by_section}
        rank_change = None
        if previous_story and previous_story["section"] == s["section"] and layout != "unknown":
            rank_change = previous_story["rank"] - s["rank"]
        s.update(id=sid, first_seen=first, last_seen=iso(now),
                 best_rank=best_by_section.get(s["section"]), rank_change=rank_change,
                 is_new=old is None, returned=old is not None and previous_story is None)
        result.append(s)
    snapshot = {"schema_version": 1, "id": now.strftime("%Y%m%dT%H%M%S%fZ"),
                "fetched_at": iso(now), "source_url": FEED, "edition": "Brazil",
                "layout": layout, "warnings": warnings, "stories": result,
                "previous_id": (previous or {}).get("id"),
                "stats": {"stories": len(result), "new": sum(s["is_new"] for s in result),
                          "retained": sum(s["id"] in prev for s in result),
                          "departed": len(set(prev) - seen), "llm_calls": 0, "cost_usd": 0}}
    return snapshot, identities


def read_json(path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as f:
        json.dump(value, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    os.replace(f.name, path)


def collect(data_dir, xml=None, now=None, force=False):
    now = now or datetime.now(timezone.utc)
    root = Path(data_dir) / "news"
    previous = read_json(root / "latest.json")
    bucket = int(now.timestamp()) // 7200
    if previous and not force:
        previous_bucket = int(datetime.fromisoformat(previous["fetched_at"].replace("Z", "+00:00")).timestamp()) // 7200
        if previous_bucket == bucket:
            return previous
    started = time.monotonic()
    try:
        if xml is None:
            request = urllib.request.Request(FEED, headers={"User-Agent": "news-engine-frontpage/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                xml = response.read(2_000_001)
            if len(xml) > 2_000_000:
                raise ValueError("Feed exceeds expected size")
        snapshot, identities = build_snapshot(xml, now, read_json(root / "identities.json", {}), previous)
        snapshot["stats"]["duration_seconds"] = round(time.monotonic() - started, 3)
        month = now.strftime("%Y-%m")
        summary = {k: snapshot[k] for k in ("id", "fetched_at", "stats", "warnings", "layout")}
        summaries = read_json(root / "indexes" / f"{month}.json", [])
        summaries = [s for s in summaries if s["id"] != snapshot["id"]] + [summary]
        months = sorted(set(read_json(root / "months.json", []) + [month]), reverse=True)
        write_json(root / "archive" / month / f"{snapshot['id']}.json", snapshot)
        write_json(root / "identities.json", identities)
        write_json(root / "indexes" / f"{month}.json", summaries)
        write_json(root / "months.json", months)
        write_json(root / "latest.json", snapshot)
        write_json(root / "status.json", {"ok": True, "attempted_at": iso(now), "error": None})
        return snapshot
    except Exception as e:
        write_json(root / "status.json", {"ok": False, "attempted_at": iso(now), "error": str(e)[:400]})
        raise


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data-dir", default="data")
    p.add_argument("--input", type=Path, help="Read an RSS fixture, no network")
    p.add_argument("--force", action="store_true")
    args = p.parse_args()
    snapshot = collect(args.data_dir, args.input.read_bytes() if args.input else None, force=args.force)
    print(f"Saved {snapshot['stats']['stories']} stories at {snapshot['fetched_at']}")


if __name__ == "__main__":
    main()
