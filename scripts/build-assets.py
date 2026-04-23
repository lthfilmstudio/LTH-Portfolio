#!/usr/bin/env python3
"""Generate favicon + OG image + apple-touch-icon from LOGO.png.

output:
  public/favicon.ico       — multi-size ICO (16, 32, 48)
  public/favicon-32.png    — 32x32 PNG
  public/apple-touch-icon.png — 180x180
  public/og.png            — 1200x630 social card
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "LOGO.png"
PUBLIC = ROOT / "public"
PUBLIC.mkdir(exist_ok=True)

# 色票（同 tokens.css）
BG = (10, 9, 8)            # #0a0908
ACCENT = (201, 169, 97)    # #c9a961
TEXT = (242, 237, 228)     # #f2ede4


def load_logo_trim() -> Image.Image:
    """讀 LOGO.png，自動 crop 掉外圍透明空白。"""
    img = Image.open(LOGO).convert("RGBA")
    bbox = img.getbbox()  # 非透明區域的 bbox
    if bbox:
        img = img.crop(bbox)
    return img


def make_favicon():
    """favicon：logo 轉成深棕色（暗色版），放白底上能看見。"""
    logo = load_logo_trim()
    # 把 logo 的白色改成暗棕色 #3a2e28（tokens --logo）
    # 原圖是白 + alpha，alpha 越高代表 logo 越實
    # 轉換：每個 pixel 的 RGB 改成 (58, 46, 40)，alpha 保留
    data = list(logo.getdata())
    new_data = [(58, 46, 40, px[3]) if len(px) == 4 else (58, 46, 40, 255) for px in data]
    dark_logo = Image.new("RGBA", logo.size)
    dark_logo.putdata(new_data)

    # 生成多個尺寸的 PNG
    sizes = [16, 32, 48, 180, 192, 512]
    icons = {}
    for sz in sizes:
        # 做正方形版本：把 logo 置中在透明正方形裡
        square = Image.new("RGBA", (max(logo.size), max(logo.size)), (0, 0, 0, 0))
        ox = (square.width - dark_logo.width) // 2
        oy = (square.height - dark_logo.height) // 2
        square.paste(dark_logo, (ox, oy), dark_logo)
        resized = square.resize((sz, sz), Image.LANCZOS)
        icons[sz] = resized

    # 儲存各尺寸
    icons[32].save(PUBLIC / "favicon-32.png")
    icons[180].save(PUBLIC / "apple-touch-icon.png")
    icons[192].save(PUBLIC / "icon-192.png")
    icons[512].save(PUBLIC / "icon-512.png")

    # ICO 多尺寸 bundle
    icons[48].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"✅ favicon.ico (16/32/48), favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png")


def find_font() -> ImageFont.FreeTypeFont:
    """macOS 找系統中文襯線字，退到英文襯線。"""
    candidates = [
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    return None


def make_og_image():
    """1200x630 OG image:
       [中央] logo (白色) + 「林姿嫺 Tzushien Lin」 + 職銜
    """
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)

    # 暗底 + 微妙暖色漸層（手工畫 radial gradient）
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_o = ImageDraw.Draw(overlay)
    # 中心暖色光暈
    for r in range(400, 0, -20):
        alpha = int(8 * (400 - r) / 400)
        draw_o.ellipse(
            [W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r],
            fill=(180, 140, 70, alpha),
        )
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    # 貼 logo（白色版，原檔）
    logo = load_logo_trim()
    # 縮到 200px 寬
    lw = 200
    lh = int(logo.height * lw / logo.width)
    logo_small = logo.resize((lw, lh), Image.LANCZOS)
    # 置中上方（距中 -80px）
    lx = (W - lw) // 2
    ly = H // 2 - lh - 60
    img.paste(logo_small, (lx, ly), logo_small)

    # 文字
    draw = ImageDraw.Draw(img)
    font_path = find_font()

    try:
        font_zh_big = ImageFont.truetype(font_path, 72) if font_path else ImageFont.load_default()
        font_en = ImageFont.truetype(font_path, 32) if font_path else ImageFont.load_default()
        font_role = ImageFont.truetype(font_path, 22) if font_path else ImageFont.load_default()
    except Exception:
        font_zh_big = font_en = font_role = ImageFont.load_default()

    def draw_centered(text, y, font, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, y), text, font=font, fill=fill)

    # 林姿嫺
    draw_centered("林姿嫺", H // 2 - 10, font_zh_big, TEXT)
    # Tzushien Lin
    draw_centered("Tzushien Lin", H // 2 + 80, font_en, (180, 170, 155))
    # 職銜
    draw_centered("Feature Film & Series Editor · 剪輯指導", H // 2 + 140, font_role, ACCENT)

    img.save(PUBLIC / "og.png", "PNG", optimize=True)
    print(f"✅ og.png 1200x630")


if __name__ == "__main__":
    make_favicon()
    make_og_image()
