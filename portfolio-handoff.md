# HANDOFF — 林姿嫺作品集網站

> Feature Film & Series Editor · Personal Portfolio
> Status: Stage 1 prototype done (single-file HTML)
> Next owner: Claude Code (多檔案重構 + 部署)

---

## 1. 專案概要

單人作品集網站，給 **林姿嫺 Tzushien Lin**（電影／劇集剪輯指導）使用。
隸屬於「原本那間剪輯工作室 / LTH Film Studio」，但網站以個人作者為主體，工作室資訊放 footer。

參考網站：`https://www.hovighagopian.com/`（電影氣質、極簡、作品為主）

### 核心定位
- 個人剪輯師作品集（**不是**工作室官網）
- 以劇照／海報展示作品（版權關係，**沒有影片**）
- 中英雙語並置，目標客戶：導演、製作公司、國際片商

---

## 2. 設計系統

### Color tokens (locked)

```css
--bg: #0a0908;          /* 近黑主背景 */
--bg-soft: #121110;     /* footer 輕微區隔 */
--panel: #1a1816;       /* 卡片底色 */
--panel-2: #201d1a;     /* 卡片深一層 */
--text: #ebe4d6;        /* 暖白主文字 */
--text-dim: #8a8378;    /* 次要文字 */
--text-faint: #4a453e;  /* 輔助／標籤 */
--accent: #c9a961;      /* 暖金強調色 */
--accent-dim: #8a7544;  /* 金色邊線／hover */
--line: #2a2723;        /* 主分隔線 */
--line-soft: #1f1d1a;   /* 輕分隔線 */
--logo: #3a2e28;        /* logo 深棕褐 */
```

### 字體
- **中文**：Noto Serif TC（Google Fonts，weight 300/400/500）
- **英文正文 / nav**：Inter（weight 300/400/500/600）
- **英文斜體／裝飾**：Cormorant Garamond（Google Fonts，italic + roman）

### 排版原則
- 中英並置：中文襯線（Noto Serif TC） → 英文斜體（Cormorant Garamond）
- 大量使用 letter-spacing（中文 0.05–0.2em，英文 uppercase 0.25–0.35em）
- 近黑背景 + 暖金 accent，散景 bokeh 氛圍做 fixed background
- **字體普遍偏小** —— 多次調整後已收斂到 profile book 尺寸
- Hover 效果：padding-left 0.4rem 滑入 + filter grayscale → 彩色

### Logo
使用 SVG 的 12 瓣螺旋花瓣造型（`#3a2e28` 深棕褐色）
**目前是 CSS 手繪近似版**，實際 logo 檔未引入。
真實 logo 有三版：深棕 / 白 / 深灰（見 client 提供圖）—— 選用深棕版。
**建議 Claude Code 要做**：把 client 的真實 logo SVG 放進 `/public/logo.svg`，替換所有 inline SVG。

---

## 3. 頁面結構

單頁式網站，4 個區塊：

```
┌─────────────────────────────────────────┐
│  NAV (fixed, thin, blur backdrop)       │
├─────────────────────────────────────────┤
│  HERO (split 1:1)                       │
│  ┌───────────────┬──────────────────┐  │
│  │ LEFT          │ RIGHT            │  │
│  │ ─ 林姿嫺 name │ ─ Selected Work  │  │
│  │ ─ 職銜         │   (8 items with │  │
│  │ ─ Profile 中/英│   56×80 thumbs) │  │
│  │ ─ Languages   │                  │  │
│  │ ─ Awards (3)  │                  │  │
│  └───────────────┴──────────────────┘  │
├─────────────────────────────────────────┤
│  01 / Feature Films                     │
│  5-col poster grid (2:3 aspect)        │
├─────────────────────────────────────────┤
│  02 / Series · Short · TV Movie         │
│  3-col credits list (30 items)         │
│  每個 credit 前面都有 36×50 縮圖         │
├─────────────────────────────────────────┤
│  FOOTER · Contact                       │
│  Email · Studio card · Social links    │
└─────────────────────────────────────────┘
```

**已移除**：獨立 About section（整合到 hero 裡）

---

## 4. 當前檔案

單一 `index.html`（約 1200 行，內含 inline CSS 和 SVG）。
無外部 JS 依賴，純 CSS 做所有 hover / transition。

### 關鍵 CSS 架構

```
.bokeh-bg        → 全域背景（fixed）
nav              → 頂端導覽
.hero            → grid 1:1 split
  .hero-left     → 人物主體 + profile + awards
  .hero-right    → Selected Work list
.section-divider → 每個區塊的 header（num + line + title）
.film-grid       → 5-col poster grid
.credits-block   → 3-col credits list
.thumb           → 共用縮圖 class（gradient placeholder + noise）
footer           → 2-col layout
```

### 共用縮圖系統
所有海報／劇照位置都用 `.thumb` class，搭配尺寸 modifier：
- `.hero-award-thumb` → 48×68
- `.featured-thumb` → 56×80
- `.cred-thumb` → 36×50
- `.film-poster` → 直式 2:3（電影 grid 專用）

15 種 gradient placeholder (`.th-1` ~ `.th-15`) 輪用，之後換成真實圖片只要改 `background-image`。

---

## 5. Client 提供的素材（需要整理）

### Profile 資料（已納入）
- 兩度金鐘獎（茶金 2022 / 牽紙鷂的手 2019）
- 一次入圍（有生之年 2024）
- 電影 5 部 + 劇集 21 部 + 短片/電視電影 9 部
- 語言：華語/台語母語、英語 conversant、客語/泰語 basic
- Email: `lthfilmstudio@gmail.com`
- Website: `lthfilmstudio.com`

### Logo（三版）
- 深棕 `#3a2e28`（✅ 採用）
- 白色
- 深灰 `#4a4a4a`

**都需要從 client 拿 SVG 檔**。

### 海報／劇照（❌ 尚未拿到實際檔案）
目前全站用 CSS gradient 做 placeholder。
需要從 client 端蒐集：

#### 電影海報（5 張，2:3 直式）
- 那張照片裡的我們 / The Photo from 1977
- 夏日最後的祕密 / Summer Blue Hour
- 甜．祕密 / Together
- 做工的人 電影版 / Workers: The Movie
- 痴情男子漢 / All Because of Love

#### Selected Work 縮圖（8 張）
- 那張照片裡的我們、我們與惡的距離 II、有生之年、拜六禮拜、
  人浮於愛、夏日最後的祕密、茶金、牽紙鷂的手

#### 劇集 credits 縮圖（21 張）
見 credits-block 第一、二欄

#### 短片/電視電影 縮圖（9 張）
見 credits-block 第三欄

**建議**：client 手邊應該有 PDF 版 profile 裡的海報圖，可以先從那裡擷取。

---

## 6. 給 Claude Code 的任務清單

### Phase 1 — 專案結構化
1. 從 `index.html` 拆出：
   - `index.html`（骨架 + content）
   - `src/styles.css`（所有 inline `<style>` 內容）
   - `public/logo.svg`（兩個 inline SVG 合併 or 引用）
   - `public/fonts.css`（Google Fonts link 獨立）
2. 建議用 **Vite + vanilla HTML/CSS** 作為最輕量選擇（或 Astro 若要 SEO + content collections）
3. 設定 `package.json` + build script

### Phase 2 — 資產整合
4. 把真實 logo SVG 放進 `/public`，替換 inline SVG
5. 準備 `/public/stills/` 資料夾結構：
   ```
   public/stills/
     featured/     (8 張 Selected Work)
     films/        (5 張電影海報)
     series/       (21 張劇集)
     shorts/       (9 張短片)
   ```
6. 命名規則建議：`{slug}-{year}.jpg`，如 `cha-jin-2021.jpg`、`hsu-yu-2024.jpg`
7. 替換所有 `.thumb` 的 CSS gradient 為 `background-image: url(...)`，可以寫一個 map：
   ```js
   const posters = {
     'cha-jin': '/stills/featured/cha-jin-2021.jpg',
     // ...
   };
   ```

### Phase 3 — 內容管理
8. 考慮把作品資料抽到 `data/works.json`，讓 HTML 從資料渲染：
   ```json
   {
     "films": [
       { "zh": "那張照片裡的我們", "en": "The Photo from 1977", "director": "湯昇榮 · 鄭乃方", "year": 2025, "poster": "/stills/films/the-photo-2025.jpg" }
     ]
   }
   ```

### Phase 4 — 優化
9. **RWD 檢查**：目前有 `@media (max-width: 960px)` 基礎處理，mobile 上可能需要：
   - credits-col 的縮圖在 mobile 上是否顯示（30 個縮圖可能太擠，考慮自動隱藏）
   - hero 的左右欄在 mobile 變上下時，右欄 Selected Work 的 list 保持單欄
10. **字體優化**：`font-display: swap` + preload Noto Serif TC
11. **SEO**：
    - `<meta>` 標籤（title, description, og:image）
    - Schema.org `Person` markup，列出獎項
    - Sitemap
12. **無障礙**：alt text（海報 aria-label）、tab 順序、focus styles

### Phase 5 — 部署
13. 建議 Cloudflare Pages 或 Vercel（靜態網站免費、自訂網域）
14. 域名：`lthfilmstudio.com` 已是 client 擁有
15. Analytics：Plausible 或 Fathom（隱私友善）

---

## 7. 待決議事項（需跟 client 確認）

- [ ] Logo 在 nav 上要用 SVG 還是真實影像檔？
- [ ] 是否要加 IMDb、Vimeo、Instagram 實際連結（目前 footer 是 placeholder）
- [ ] Contact 是否要加一個簡單的表單（vs 只留 email link）
- [ ] 是否要多一個 **中文繁體／英文** 語言切換？還是雙語並置就夠
- [ ] mobile 上縮圖的顯示策略（全顯示 vs 只保留文字）
- [ ] 網站 metadata 的中英文版本
- [ ] 是否需要單一作品的詳細頁（目前所有作品都只有卡片，沒有內頁）

---

## 8. 設計決策紀錄（why not）

記錄一些看起來可能奇怪、但其實有原因的決定：

- **為什麼沒有 showreel / 自動播放影片？**
  Client 因版權問題只有劇照，所以網站設計全程避開影片元素，改由「排版節奏」承擔動態感。

- **為什麼中英文並置，而不是做成語言切換？**
  電影圈的受眾同時會有中文／英文 client（國際製片、平台），一次呈現兩種語言比隱藏切換更直接。

- **為什麼 nav 那麼小？**
  Client 明確要求縮小 1/2，讓主內容說話，不希望 nav 搶視覺。

- **為什麼 Awards 放 hero 第一區塊？**
  Client 要求，取代了原本的 "2×／1×／30+" stats 數字。兩度金鐘 + 入圍本身就是最強的門面。

- **為什麼所有作品都有縮圖？**
  Client 明確要求 "所有的都保留海報或劇照區塊"。後續真實圖片到位後視覺效果會好很多。

---

## 9. 聯絡

- Client email: `lthfilmstudio@gmail.com`
- Client name: 林姿嫺 Tzushien Lin
- Studio: 原本那間剪輯工作室 LTH Film Studio
- Established: 2024
- Based in: Taipei

---

## 10. 完整 HTML 原始碼

見下方 artifact「portfolio-visual-explore」—— 包含所有 HTML + inline CSS，可直接存為 `index.html` 使用。

建議的拆分方式（給 Claude Code 參考）：

```
portfolio-website/
├── index.html
├── src/
│   ├── styles/
│   │   ├── tokens.css      (color/font variables)
│   │   ├── base.css        (reset, body, bokeh-bg)
│   │   ├── nav.css
│   │   ├── hero.css
│   │   ├── sections.css    (film-grid, credits-block)
│   │   ├── footer.css
│   │   └── thumb.css       (shared thumbnail system)
│   └── data/
│       └── works.json
├── public/
│   ├── logo.svg
│   └── stills/
│       ├── featured/
│       ├── films/
│       ├── series/
│       └── shorts/
├── package.json
└── vite.config.js
```

---

**Last updated**: 2026-04-23
**From**: Claude (Opus 4.7) visual exploration stage
**To**: Claude Code for project structuring + deployment
