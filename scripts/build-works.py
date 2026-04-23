#!/usr/bin/env python3
"""Notion CSV → src/data/works.json

從 Notion DB 匯出的 CSV 解析成結構化 works.json，給 Astro 首頁 filter grid 和詳細頁用。
"""
import csv
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "Notion DB/林姿嫺 Tzushien Lin/Professional Portfolio - DB/Projects 1e858e03bb0e81af870cfd0a0053a221.csv"
OUT_PATH = ROOT / "src/data/works.json"
# 從 Notion 網頁 scrape 的 markdown，用來抓每個 URL 的顯示標籤
NOTION_MD = Path("/tmp/notion-full.md")


def build_url_label_map() -> dict[str, str]:
    """從 Notion 網頁 markdown 抽出 [label](url) 對照表。"""
    if not NOTION_MD.exists():
        return {}
    text = NOTION_MD.read_text(encoding="utf-8")
    # 抓所有 [label](url) — label 不含 ] 和方括號內的巢狀
    # URL 限 http(s) 開頭
    pattern = re.compile(r"\[([^\[\]]+?)\]\((https?://[^\s)]+)\)")
    mapping: dict[str, str] = {}
    for m in pattern.finditer(text):
        label, url = m.group(1).strip(), m.group(2).strip()
        # 清掉 URL 尾巴可能附帶的標點
        url = url.rstrip(".,;:)")
        # 跳過圖片 alt 和 Notion 自己的 detail URL（label 通常是中文作品名開頭）
        if "notion.site" in url:
            continue
        if label in ("▶️", ""):
            continue
        # 第一個 label 優先（Notion 同 URL 可能出現多次，第一次通常最正確）
        if url not in mapping:
            mapping[url] = label
    return mapping


URL_LABEL_MAP = build_url_label_map()


def split_title(raw: str) -> tuple[str, str]:
    """把 '我們與惡的距離 II The World Between Us' 切成 zh / en。

    規則：找第一個「CJK 字元後接 ASCII 字母」的邊界切。
    若找不到分界（純中文或純英文），en 留空。
    """
    raw = raw.strip()
    if not raw:
        return ("", "")

    # 找第一個「真英文字」起點：空白後的大寫字母 + 2 個以上小寫
    # 這樣 II / III / JJ 等全大寫縮寫會被視為中文標題的一部分
    match = re.search(r"(?<=\s)([A-Z][a-z]{2,})", raw)
    if match:
        split_idx = match.start(1)
        zh = raw[:split_idx].strip()
        en = raw[split_idx:].strip()
        return (zh, en)

    # 看是不是純英文開頭（藝人名）如 "JJ林俊傑 - 殺手 電影版"
    # 這類 zh/en 混雜的，整段當 zh，en 空
    return (raw, "")


def parse_links(raw: str) -> list[dict]:
    """'▶️ https://... \n▶️ https://...' → [{type, url, label}, ...]

    每行一個連結，根據 URL 判斷類型。
    """
    links = []
    if not raw:
        return links
    # 全文掃一次 URL，處理兩個 URL 無空白黏一起的情況
    # 用 lookahead 把 http:// 當分隔符
    text = raw.replace("\xa0", " ")
    urls = re.findall(r"https?://[^\s]+?(?=https?://|$|[\s])", text)
    seen = set()
    for url in urls:
        url = url.rstrip(".,;:)")
        if url in seen:
            continue
        seen.add(url)
        link = classify_link(url)
        # 加標籤（若在 Notion 網頁 map 裡有）
        if url in URL_LABEL_MAP:
            link["label"] = URL_LABEL_MAP[url]
        links.append(link)
    return links


def classify_link(url: str) -> dict:
    """根據 URL host 判斷類型，標 label 預設空（UI 側決定）。"""
    host = re.sub(r"^https?://(www\.)?", "", url).split("/")[0].lower()
    if "youtu" in host:
        return {"type": "youtube", "url": url}
    if "facebook" in host or "fb.watch" in host:
        return {"type": "facebook", "url": url}
    if "netflix" in host:
        return {"type": "netflix", "url": url}
    if "iq.com" in host or "iqiyi" in host:
        return {"type": "iqiyi", "url": url}
    if "kktv" in host:
        return {"type": "kktv", "url": url}
    if "catchplay" in host:
        return {"type": "catchplay", "url": url}
    if "friday" in host:
        return {"type": "friday", "url": url}
    if "myvideo" in host:
        return {"type": "myvideo", "url": url}
    if "hakkatv" in host:
        return {"type": "hakkatv", "url": url}
    if "ptsplus" in host or "pts.org" in host:
        return {"type": "pts", "url": url}
    if "hamivideo" in host:
        return {"type": "hami", "url": url}
    if "vimeo" in host:
        return {"type": "vimeo", "url": url}
    return {"type": "link", "url": url}


GENRE_MAP = {
    "電影 Feature Film": "feature",
    "劇集 Series": "series",
    "預告片花 Trailer": "trailer",
    "短片 Short Film": "short",
    "廣告 Commercial": "commercial",
    "音樂錄影帶 Music Video": "mv",
    "電視電影 TV Movie": "tvmovie",
}


def parse_genre(raw: str) -> list[str]:
    """'劇集 Series, 短片 Short Film' → ['series', 'short']"""
    if not raw:
        return []
    parts = [p.strip() for p in raw.split(",")]
    return [GENRE_MAP[p] for p in parts if p in GENRE_MAP]


def slugify(zh: str, en: str, year: str) -> str:
    """Slug 優先用英文名，沒英文名就用羅馬拼音簡化（保留 zh hash 不現實，用序號）。"""
    base = en or zh
    # 簡單處理：英文 lowercase、非 alnum 改 -
    s = re.sub(r"[^a-zA-Z0-9一-鿿]+", "-", base).strip("-").lower()
    # 中文 slug 在 URL 上 OK（Astro 會 encode），但為了乾淨還是盡量留英文
    if not re.search(r"[a-z]", s):
        # 全中文 fallback：用年份 + 簡碼
        s = f"work-{year}-{s[:20]}"
    if year:
        s = f"{s}-{year}" if year not in s else s
    return s[:80]


def main():
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    works = []
    for idx, r in enumerate(rows):
        raw_title = r.get("Projects", "").strip()
        if not raw_title:
            continue
        zh, en = split_title(raw_title)
        year = r.get("Year", "").strip()
        categories = parse_genre(r.get("Genre", ""))
        if not categories:
            print(f"  ⚠️  skip (no category): {raw_title}", file=sys.stderr)
            continue

        director = r.get("Director", "").strip().removeprefix("導演 ").strip()
        writers = r.get("Writers", "").strip().removeprefix("編劇 ").strip()
        description = r.get("Description", "").strip()
        links = parse_links(r.get("Related", ""))
        slug = slugify(zh, en, year)

        # Cover：CSV 可能有多張逗點分隔；實體檔名已 rename 為解碼後的原字元
        # URL 裡空白替換為 %20（browser 會自動處理中文 encoding）
        raw_cover = r.get("Cover", "").strip()
        cover = ""
        covers_all = []
        if raw_cover:
            for c in raw_cover.split(","):
                c = c.strip()
                # 連續 unquote 直到穩定（Notion 有時雙層編碼）
                prev = None
                while prev != c:
                    prev = c
                    c = unquote(c)
                if c and (ROOT / "public/stills/covers" / c).exists():
                    covers_all.append(f"/stills/covers/{c.replace(' ', '%20')}")
            if covers_all:
                cover = covers_all[0]

        # YouTube 縮圖優先（scripts/fetch-youtube-covers.py 抓的）：畫質通常好過 FB 縮圖
        # 但保留原 Notion cover 作為 coverOriginal（之後如果用戶要 revert 可以用）
        yt_thumb = ROOT / "public/stills/covers/yt" / f"{slug}.jpg"
        cover_original = cover
        if yt_thumb.exists():
            cover = f"/stills/covers/yt/{slug}.jpg"

        # 決定是否有詳細頁（MV/廣告不做）
        has_detail = not (set(categories) <= {"mv", "commercial"})

        works.append({
            "slug": slug,
            "titleZh": zh,
            "titleEn": en,
            "year": year,
            "categories": categories,
            "primaryCategory": categories[0],
            "director": director,
            "writers": writers,
            "description": description,
            "cover": cover,
            "coverOriginal": cover_original,
            "covers": covers_all,
            "links": links,
            "hasDetail": has_detail,
        })

    # 年份 desc 排序
    works.sort(key=lambda w: (w["year"] or "0"), reverse=True)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(works, f, ensure_ascii=False, indent=2)

    # Stats
    from collections import Counter
    cat_count = Counter()
    for w in works:
        for c in w["categories"]:
            cat_count[c] += 1
    print(f"✅ {len(works)} works → {OUT_PATH.relative_to(ROOT)}")
    print("Category counts:")
    for c, n in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f"  {c}: {n}")
    print(f"With detail page: {sum(1 for w in works if w['hasDetail'])}")
    print(f"External-only (MV/Commercial): {sum(1 for w in works if not w['hasDetail'])}")


if __name__ == "__main__":
    main()
