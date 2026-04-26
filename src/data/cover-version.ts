import fs from 'node:fs';
import path from 'node:path';

const versionCache = new Map<string, string>();

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
