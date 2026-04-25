#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow>=10"]
# ///
"""產生 favicon、OG image、footer logo。

Sources:
  assets/logo/20260109_原本那間logo_白.png  (white-on-transparent)
  assets/logo/20260109_原本那間logo_K100.png (black-on-transparent)

Outputs:
  public/logo/studio-white.png           — footer 用，原圖白版
  public/favicon-32.png                  — 32×32 emblem only
  public/icon-192.png                    — 192×192 emblem
  public/icon-512.png                    — 512×512 emblem
  public/apple-touch-icon.png            — 180×180 emblem with bg
  public/og.png                          — 1200×630 dark bg + 中央 logo
  public/favicon.ico                     — 多尺寸 ico
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_WHITE = ROOT / "assets/logo/20260109_原本那間logo_白.png"
SRC_BLACK = ROOT / "assets/logo/20260109_原本那間logo_K100.png"
SRC_COLOR = ROOT / "assets/logo/20260109_原本那間logo.png"
PUBLIC = ROOT / "public"
LOGO_DIR = PUBLIC / "logo"
LOGO_DIR.mkdir(parents=True, exist_ok=True)

BG_DARK = (10, 9, 8, 255)         # --bg
BG_PANEL = (26, 24, 22, 255)      # --panel

def crop_emblem(img: Image.Image) -> Image.Image:
    """Logo 是 1920×1080 canvas，中央徽章直徑約 660px，中心約 (960, 470)。
    擷取 720×720 拿到純圖徽（去掉四角 原/本/那/間 跟下方剪輯工作室）。"""
    w, h = img.size
    side = 720
    cx, cy = w // 2, 470  # 視覺中心略高於幾何中心（下方有副標佔位）
    left = cx - side // 2
    top = cy - side // 2
    return img.crop((left, top, left + side, top + side))

def make_icon(emblem_white: Image.Image, size: int, bg=(10, 9, 8, 255), inset_ratio=0.78) -> Image.Image:
    """Emblem 置中、留 padding，深底正方形 icon，永遠看得見。"""
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * inset_ratio)
    em = emblem_white.resize((inner, inner), Image.LANCZOS)
    pos = ((size - inner) // 2, (size - inner) // 2)
    canvas.paste(em, pos, em)
    return canvas

def main():
    print("→ load source PNGs")
    img_white = Image.open(SRC_WHITE).convert("RGBA")
    img_black = Image.open(SRC_BLACK).convert("RGBA")
    print(f"  white: {img_white.size}, black: {img_black.size}")

    # ============ FOOTER LOGO（保留四字 + 圖徽完整版） ============
    out = LOGO_DIR / "studio-white.png"
    # 等比縮小一點點減少檔案大小（footer 顯示寬度頂多 360px）
    target = img_white.copy()
    target.thumbnail((1200, 700), Image.LANCZOS)
    target.save(out, optimize=True)
    print(f"  footer logo → {out.relative_to(ROOT)}  ({target.size})")

    # ============ FAVICONS — 中央徽章 + 深底（瀏覽器分頁多為白底，要永遠可見）============
    emblem_white = crop_emblem(img_white)

    # 32×32 favicon
    fav32 = make_icon(emblem_white, 32)
    fav32.save(PUBLIC / "favicon-32.png", optimize=True)
    print(f"  favicon-32.png (32×32 dark bg)")

    # 192 / 512 — PWA icons
    for size in (192, 512):
        ico = make_icon(emblem_white, size)
        ico.save(PUBLIC / f"icon-{size}.png", optimize=True)
        print(f"  icon-{size}.png ({size}×{size} dark bg)")

    # apple-touch-icon 180×180 — iOS 主畫面，圓角自動處理（用 panel 灰底略有層次）
    apple = make_icon(emblem_white, 180, bg=BG_PANEL, inset_ratio=0.7)
    apple.save(PUBLIC / "apple-touch-icon.png", optimize=True)
    print("  apple-touch-icon.png (180×180 panel bg)")

    # favicon.ico — 多尺寸（16, 32, 48）
    fav_ico = make_icon(emblem_white, 48)
    fav_ico.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  favicon.ico (multi-size 16/32/48)")

    # ============ OG IMAGE 1200×630 ============
    og = Image.new("RGBA", (1200, 630), BG_DARK)
    # 把整個 white logo 放進去，留約 60px 邊距，等比縮放
    logo_for_og = img_white.copy()
    max_w, max_h = 1080, 510
    logo_for_og.thumbnail((max_w, max_h), Image.LANCZOS)
    lw, lh = logo_for_og.size
    pos = ((1200 - lw) // 2, (630 - lh) // 2)
    og.paste(logo_for_og, pos, logo_for_og)
    og.convert("RGB").save(PUBLIC / "og.png", optimize=True, quality=90)
    print(f"  og.png (1200×630, logo {logo_for_og.size} centered)")

    print("\n✓ 全部產出完成。")

if __name__ == "__main__":
    main()
