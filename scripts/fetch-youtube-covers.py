#!/usr/bin/env python3
"""從每個作品的 YouTube 連結抓 maxresdefault 縮圖當更好的海報。

輸出到 public/stills/covers/yt/{slug}.jpg
"""
import json
import re
import sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public/stills/covers/yt"
OUT_DIR.mkdir(parents=True, exist_ok=True)
WORKS = json.loads((ROOT / "src/data/works.json").read_text(encoding="utf-8"))


def extract_video_id(url: str) -> "str | None":
    """YouTube URL 抽出 video ID。支援 youtu.be 和 youtube.com 兩種。"""
    patterns = [
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"youtube\.com/watch\?v=([A-Za-z0-9_-]{11})",
        r"youtube\.com/embed/([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def download_thumb(video_id: str, out_path: Path) -> "str | None":
    """嘗試多種尺寸，回傳成功下載的 quality 名稱（maxresdefault / sddefault / hqdefault）。"""
    qualities = ["maxresdefault", "sddefault", "hqdefault", "mqdefault"]
    for q in qualities:
        url = f"https://img.youtube.com/vi/{video_id}/{q}.jpg"
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=10) as resp:
                data = resp.read()
                # maxresdefault 不存在時 YouTube 會回 120x90 的預設灰圖（~1KB）
                if q == "maxresdefault" and len(data) < 5000:
                    continue
                out_path.write_bytes(data)
                return q
        except HTTPError:
            continue
        except Exception as e:
            print(f"    error: {e}")
            continue
    return None


def main():
    stats = {"ok": 0, "skip_no_yt": 0, "skip_no_detail": 0, "fail": 0}
    for w in WORKS:
        slug = w["slug"]
        yt = next((l["url"] for l in w["links"] if l["type"] == "youtube"), None)
        if not yt:
            stats["skip_no_yt"] += 1
            continue
        vid = extract_video_id(yt)
        if not vid:
            print(f"  [skip] {slug}: 抽不出 video id from {yt}")
            stats["fail"] += 1
            continue
        out = OUT_DIR / f"{slug}.jpg"
        if out.exists():
            print(f"  [skip] {slug}: 已存在")
            stats["ok"] += 1
            continue
        quality = download_thumb(vid, out)
        if quality:
            print(f"  [{quality}] {slug} ← {vid}")
            stats["ok"] += 1
        else:
            print(f"  [fail] {slug} ← {vid}")
            stats["fail"] += 1

    print(f"\n=== Stats ===")
    print(f"  Downloaded: {stats['ok']}")
    print(f"  No YouTube link: {stats['skip_no_yt']}")
    print(f"  Failed: {stats['fail']}")


if __name__ == "__main__":
    main()
