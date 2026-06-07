import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const versionCache = new Map<string, string>();
const generatedCache = new Map<string, string | undefined>();
const GENERATED_COVER_DIR = '/stills/covers/_generated';

/**
 * 把 cover/img 路徑加上 ?v=<mtime> 版本碼，避免 Cloudflare/瀏覽器 cache
 * 拿到舊版圖。換新圖 → mtime 變 → URL 變 → 一定抓新版。
 *
 * 規則：
 * - 路徑必須以 / 開頭（指向 public/）
 * - 已有 query string 就直接回傳（不重複加）
 * - 檔案不存在或讀取失敗，回傳原路徑
 * - build 期間 cache，避免重複 stat
 */
export function versionedUrl(url: string | undefined | null): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.startsWith('/')) return url;
  if (url.includes('?')) return url;
  if (versionCache.has(url)) return versionCache.get(url)!;

  const fsPath = path.join(process.cwd(), 'public', url);
  let stamp = '';
  try {
    stamp = Math.floor(fs.statSync(fsPath).mtimeMs).toString(36);
  } catch {
    versionCache.set(url, url);
    return url;
  }
  const out = `${url}?v=${stamp}`;
  versionCache.set(url, out);
  return out;
}

function stripQuery(url: string): string {
  return url.split('?')[0];
}

function generatedCoverPath(url: string, width: number): string {
  const cleanUrl = stripQuery(url);
  const basename = path.basename(cleanUrl, path.extname(cleanUrl));
  const slug = basename
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cover';
  const hash = crypto.createHash('sha1').update(cleanUrl).digest('hex').slice(0, 10);
  return `${GENERATED_COVER_DIR}/${slug}-${hash}-${width}w.webp`;
}

function existingGeneratedCover(url: string | undefined | null, width: number): string | undefined {
  if (!url || !url.startsWith('/')) return undefined;

  const cacheKey = `${url}|${width}`;
  if (generatedCache.has(cacheKey)) return generatedCache.get(cacheKey);

  const generated = generatedCoverPath(url, width);
  const fsPath = path.join(process.cwd(), 'public', generated);
  const out = fs.existsSync(fsPath) ? generated : undefined;
  generatedCache.set(cacheKey, out);
  return out;
}

export function optimizedCoverUrl(url: string | undefined | null, width: number): string | undefined {
  return versionedUrl(existingGeneratedCover(url, width) ?? url);
}

export function optimizedCoverSrcSet(url: string | undefined | null, widths: number[]): string | undefined {
  const entries = widths
    .map((width) => {
      const generated = existingGeneratedCover(url, width);
      return generated ? `${versionedUrl(generated)} ${width}w` : null;
    })
    .filter(Boolean);

  return entries.length ? entries.join(', ') : undefined;
}
