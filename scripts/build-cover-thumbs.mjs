import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(PUBLIC_DIR, 'stills/covers/_generated');
const WIDTHS = [360, 720];

const works = JSON.parse(await fs.readFile(path.join(ROOT, 'src/data/works.json'), 'utf8'));
const awards = JSON.parse(await fs.readFile(path.join(ROOT, 'src/data/awards.json'), 'utf8'));

function stripQuery(url) {
  return url.split('?')[0];
}

function outputPathForUrl(url, width) {
  const cleanUrl = stripQuery(url);
  const basename = path.basename(cleanUrl, path.extname(cleanUrl));
  const slug = basename
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cover';
  const hash = crypto.createHash('sha1').update(cleanUrl).digest('hex').slice(0, 10);
  return path.join(OUT_DIR, `${slug}-${hash}-${width}w.webp`);
}

function publicPathFromUrl(url) {
  const pathname = decodeURIComponent(stripQuery(url));
  if (!pathname.startsWith('/stills/covers/')) return null;
  return path.join(PUBLIC_DIR, pathname);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function newestInputMtime(inputPath) {
  try {
    return (await fs.stat(inputPath)).mtimeMs;
  } catch {
    return 0;
  }
}

async function needsBuild(inputPath, outputPath) {
  try {
    const [inputStat, outputStat] = await Promise.all([fs.stat(inputPath), fs.stat(outputPath)]);
    return outputStat.mtimeMs + 1000 < inputStat.mtimeMs;
  } catch {
    return true;
  }
}

function collectCoverUrls() {
  const bySlug = new Map(works.map((work) => [work.slug, work]));
  const urls = new Set();

  for (const work of works) {
    if (work.cover) urls.add(work.cover);
  }

  for (const award of awards) {
    const workCover = award.workSlug ? bySlug.get(award.workSlug)?.cover : '';
    const cover = workCover || award.poster;
    if (cover) urls.add(cover);
  }

  return [...urls].sort();
}

await fs.mkdir(OUT_DIR, { recursive: true });

let built = 0;
let skipped = 0;
let missing = 0;

for (const url of collectCoverUrls()) {
  const inputPath = publicPathFromUrl(url);
  if (!inputPath || !(await exists(inputPath))) {
    missing += 1;
    continue;
  }

  for (const width of WIDTHS) {
    const outputPath = outputPathForUrl(url, width);
    if (!(await needsBuild(inputPath, outputPath))) {
      skipped += 1;
      continue;
    }

    await sharp(inputPath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toFile(outputPath);

    const mtime = await newestInputMtime(inputPath);
    if (mtime) {
      const date = new Date(mtime);
      await fs.utimes(outputPath, date, date);
    }
    built += 1;
  }
}

console.log(`[cover-thumbs] built=${built} skipped=${skipped} missing=${missing}`);
