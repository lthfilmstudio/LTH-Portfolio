#!/usr/bin/env python3
"""Merge Notion link labels into src/data/works.json.

Strategy:
- For each work, build a {normalized_url: label} map from Notion results.
- For each existing link in works.json: if its normalized URL matches, attach label.
- Any Notion link whose normalized URL isn't in existing links gets appended.
- Preserves order of existing links; appends new Notion-only links after.
"""
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlunparse

ROOT = Path(__file__).resolve().parent.parent
WORKS = ROOT / "src/data/works.json"
NOTION = ROOT / "tmp/notion-links.json"


def normalize_url(url: str) -> str:
    """Canonicalize URL for cross-source matching.
    - Strip tracking params (si, utm_*, feature)
    - Collapse youtu.be/ID and youtube.com/watch?v=ID to same key
    - Lowercase host, strip trailing slash
    """
    try:
        p = urlparse(url.strip())
    except Exception:
        return url.strip().lower()

    host = (p.hostname or "").lower().lstrip("www.")
    path = p.path.rstrip("/")

    # YouTube: collapse to canonical id
    yt_id = None
    if host in ("youtu.be",) and path:
        yt_id = path.lstrip("/").split("/")[0]
    elif host == "youtube.com" and path == "/watch":
        qs = parse_qs(p.query)
        yt_id = (qs.get("v") or [None])[0]
    if yt_id:
        return f"yt:{yt_id}"

    # Strip tracking params
    if p.query:
        keep = []
        for pair in p.query.split("&"):
            k = pair.split("=", 1)[0].lower()
            if k in ("si", "feature") or k.startswith("utm_"):
                continue
            keep.append(pair)
        new_q = "&".join(keep)
    else:
        new_q = ""

    return urlunparse(("", host, path, "", new_q, "")).lstrip("/")


def main():
    works = json.loads(WORKS.read_text(encoding="utf-8"))
    notion = json.loads(NOTION.read_text(encoding="utf-8"))
    results = notion.get("results", {})

    stats = {
        "labeled": 0,
        "appended": 0,
        "unchanged_works": 0,
        "touched_works": 0,
    }

    for w in works:
        slug = w.get("slug")
        notion_links = results.get(slug)
        if not notion_links:
            stats["unchanged_works"] += 1
            continue

        existing = w.get("links", []) or []
        notion_by_norm = {normalize_url(nl["url"]): nl for nl in notion_links}
        existing_norms = set()

        out = []
        for link in existing:
            norm = normalize_url(link["url"])
            existing_norms.add(norm)
            nl = notion_by_norm.get(norm)
            if nl and nl.get("label") and not link.get("label"):
                link["label"] = nl["label"]
                stats["labeled"] += 1
            out.append(link)

        # Append Notion-only links (not in existing)
        for norm, nl in notion_by_norm.items():
            if norm in existing_norms:
                continue
            out.append({
                "type": nl["type"],
                "url": nl["url"],
                **({"label": nl["label"]} if nl.get("label") else {}),
            })
            stats["appended"] += 1

        if out != existing:
            w["links"] = out
            stats["touched_works"] += 1

    WORKS.write_text(
        json.dumps(works, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Works touched:       {stats['touched_works']}")
    print(f"Labels attached:     {stats['labeled']}")
    print(f"Notion-only links appended: {stats['appended']}")
    print(f"Works unchanged:     {stats['unchanged_works']}")


if __name__ == "__main__":
    main()
