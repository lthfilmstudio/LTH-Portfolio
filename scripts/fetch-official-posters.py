#!/usr/bin/env python3
"""從 Wikipedia 抓作品官方海報。

策略：
1. 用 Wikipedia opensearch 找到對應條目
2. query 那個條目的 prop=images 拿所有圖片清單
3. Filter 出看起來是海報的檔案（.jpg/.png，排除 icon/flag/svg）
4. imageinfo 拿實際 URL，下載存到 public/stills/covers/official/{slug}.jpg
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public/stills/covers/official"
OUT_DIR.mkdir(parents=True, exist_ok=True)
WORKS = json.loads((ROOT / "src/data/works.json").read_text(encoding="utf-8"))

HEADERS = {
    "User-Agent": "LTH-Portfolio-Bot/1.0 (lthfilmstudio@gmail.com)",
}

# 過濾掉明顯不是海報的檔案關鍵字
EXCLUDE_PATTERNS = [
    r"\.svg$",
    r"(?i)flag.*\.(jpg|png)",
    r"(?i)icon",
    r"(?i)portal",
    r"(?i)Nuvola",
    r"(?i)P_culture",
    r"(?i)Puzzle",
    r"Lock-",
    r"(?i)Taiwan-icon",
    r"(?i)wiki.*logo",
    r"(?i)Wikimedia",
    r"(?i)Commons-logo",
]


def fetch_json(url: str) -> dict:
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode("utf-8"))


def find_page_title(lang: str, query: str) -> "str | None":
    """用 opensearch 找最接近的 title。"""
    api = (
        f"https://{lang}.wikipedia.org/w/api.php?"
        f"action=opensearch&search={quote(query)}&limit=5&namespace=0&format=json"
    )
    try:
        data = fetch_json(api)
        titles = data[1] if len(data) >= 2 else []
        # 找第一個不是 disambiguation 的
        for t in titles:
            if "消歧義" in t or "disambiguation" in t.lower():
                continue
            return t
    except Exception:
        pass
    return None


def list_page_images(lang: str, title: str) -> list:
    """回傳該條目所有圖片檔名 (File:XXX)。"""
    api = (
        f"https://{lang}.wikipedia.org/w/api.php?"
        f"action=query&titles={quote(title)}&prop=images"
        f"&imlimit=30&format=json&redirects=1"
    )
    try:
        data = fetch_json(api)
        pages = data.get("query", {}).get("pages", {})
        for pid, page in pages.items():
            if pid == "-1":
                continue
            return [img["title"] for img in page.get("images", [])]
    except Exception:
        pass
    return []


def filter_poster_candidates(images: list, title_zh: str, title_en: str) -> list:
    """排除明顯非海報的檔，按可能性排序。"""
    candidates = []
    for img in images:
        if any(re.search(p, img) for p in EXCLUDE_PATTERNS):
            continue
        # 要是 jpg/png/webp
        if not re.search(r"\.(jpg|jpeg|png|webp)$", img, re.I):
            continue
        candidates.append(img)

    # 優先級：檔名含 poster > 檔名含 title 字樣 > 其他
    def score(img):
        s = 0
        low = img.lower()
        if "poster" in low:
            s += 100
        if title_en and title_en.lower().split()[0] in low:
            s += 20
        # 中文 title 字樣（例如「茶金」出現在檔名）
        for ch in title_zh[:2]:
            if ch in img:
                s += 10
        return -s

    candidates.sort(key=score)
    return candidates


def get_image_url(lang: str, file_title: str) -> "str | None":
    """從 File:XXX 拿實際圖片 URL。"""
    api = (
        f"https://{lang}.wikipedia.org/w/api.php?"
        f"action=query&titles={quote(file_title)}&prop=imageinfo"
        f"&iiprop=url&format=json"
    )
    try:
        data = fetch_json(api)
        pages = data.get("query", {}).get("pages", {})
        for pid, page in pages.items():
            info = page.get("imageinfo", [])
            if info:
                return info[0].get("url")
    except Exception:
        pass
    return None


def download(url: str, out_path: Path) -> bool:
    try:
        req = Request(url, headers=HEADERS)
        with urlopen(req, timeout=20) as resp:
            data = resp.read()
            if len(data) < 3000:
                return False
            out_path.write_bytes(data)
            return True
    except Exception as e:
        print(f"    download fail: {e}")
        return False


def try_fetch(title_zh: str, title_en: str) -> "str | None":
    for lang, query in [("zh", title_zh), ("en", title_en), ("zh", title_en)]:
        if not query:
            continue
        page_title = find_page_title(lang, query)
        if not page_title:
            continue
        images = list_page_images(lang, page_title)
        candidates = filter_poster_candidates(images, title_zh, title_en)
        for c in candidates[:3]:
            url = get_image_url(lang, c)
            if url:
                return url
    return None


def main():
    target_cats = {"feature", "series", "tvmovie", "short"}
    stats = {"found": 0, "not_found": 0, "skip": 0}
    for w in WORKS:
        if not (set(w["categories"]) & target_cats):
            stats["skip"] += 1
            continue

        slug = w["slug"]
        out = OUT_DIR / f"{slug}.jpg"
        if out.exists():
            print(f"  [skip] {slug}: 已有")
            stats["found"] += 1
            continue

        print(f"  查: {w['titleZh'][:20]} / {w['titleEn'][:30]}...", end=" ", flush=True)
        url = try_fetch(w["titleZh"], w["titleEn"])
        if url:
            ok = download(url, out)
            if ok:
                print(f"✅ {url.split('/')[-1][:50]}")
                stats["found"] += 1
            else:
                print(f"⚠️ 下載失敗")
                stats["not_found"] += 1
        else:
            print(f"❌")
            stats["not_found"] += 1
        time.sleep(0.4)

    print(f"\n=== Stats ===")
    print(f"  Found: {stats['found']}, Not found: {stats['not_found']}, Skipped: {stats['skip']}")


if __name__ == "__main__":
    main()
