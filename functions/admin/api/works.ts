// Cloudflare Pages Function: POST /admin/api/works
// Atomically replaces src/data/works.json with the posted array.
// Protected by Cloudflare Access on /admin path.

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';
const BRANCH = 'main';
const WORKS_JSON_PATH = 'src/data/works.json';

const ALLOWED_CATEGORIES = new Set([
  'feature',
  'series',
  'trailer',
  'short',
  'commercial',
  'mv',
  'tvmovie',
]);

const ALLOWED_LINK_TYPES = new Set([
  'youtube',
  'facebook',
  'netflix',
  'iqiyi',
  'catchplay',
  'friday',
  'hakkatv',
  'hami',
  'kktv',
  'myvideo',
  'pts',
  'link',
]);

type Link = { type: string; url: string; label?: string };
type Work = {
  slug: string;
  titleZh: string;
  titleEn?: string;
  year?: string;
  categories: string[];
  primaryCategory: string;
  director?: string;
  writers?: string;
  description?: string;
  cover?: string;
  coverOriginal?: string;
  covers?: string[];
  links?: Link[];
  hasDetail?: boolean;
};

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validateWork(w: any, idx: number): string | null {
  if (!w || typeof w !== 'object') return `work[${idx}]: not an object`;
  if (!isString(w.slug) || !/^[\p{L}\p{N}\-]+$/u.test(w.slug))
    return `work[${idx}]: invalid slug "${w.slug}"`;
  if (!isString(w.titleZh) || !w.titleZh.trim())
    return `work[${idx}] (${w.slug}): titleZh required`;
  if (w.titleEn !== undefined && !isString(w.titleEn))
    return `work[${idx}] (${w.slug}): titleEn must be string`;
  if (w.year !== undefined && !isString(w.year))
    return `work[${idx}] (${w.slug}): year must be string`;
  if (!Array.isArray(w.categories) || w.categories.length === 0)
    return `work[${idx}] (${w.slug}): categories must be non-empty array`;
  for (const c of w.categories) {
    if (!ALLOWED_CATEGORIES.has(c))
      return `work[${idx}] (${w.slug}): invalid category "${c}"`;
  }
  if (!isString(w.primaryCategory) || !w.categories.includes(w.primaryCategory))
    return `work[${idx}] (${w.slug}): primaryCategory must be in categories`;

  for (const f of ['director', 'writers', 'description', 'cover', 'coverOriginal']) {
    if (w[f] !== undefined && !isString(w[f]))
      return `work[${idx}] (${w.slug}): ${f} must be string`;
  }

  if (w.covers !== undefined) {
    if (!Array.isArray(w.covers)) return `work[${idx}] (${w.slug}): covers must be array`;
    for (const c of w.covers) if (!isString(c)) return `work[${idx}] (${w.slug}): covers entries must be strings`;
  }

  if (w.links !== undefined) {
    if (!Array.isArray(w.links)) return `work[${idx}] (${w.slug}): links must be array`;
    for (let li = 0; li < w.links.length; li++) {
      const l = w.links[li];
      if (!l || typeof l !== 'object') return `work[${idx}] (${w.slug}) links[${li}]: not object`;
      if (!isString(l.type) || !ALLOWED_LINK_TYPES.has(l.type))
        return `work[${idx}] (${w.slug}) links[${li}]: invalid type "${l.type}"`;
      if (!isString(l.url) || !/^https?:\/\//i.test(l.url))
        return `work[${idx}] (${w.slug}) links[${li}]: invalid url`;
      if (l.label !== undefined && !isString(l.label))
        return `work[${idx}] (${w.slug}) links[${li}]: label must be string`;
    }
  }

  if (w.hasDetail !== undefined && typeof w.hasDetail !== 'boolean')
    return `work[${idx}] (${w.slug}): hasDetail must be boolean`;

  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return json({ error: 'unauthorized' }, 401);
  }

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) return json({ error: 'missing GITHUB_TOKEN env' }, 500);

  let body: { works?: unknown; pendingPosters?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (!Array.isArray(body.works)) return json({ error: 'works must be array' }, 400);

  const works = body.works as Work[];
  const slugs = new Set<string>();
  for (let i = 0; i < works.length; i++) {
    const err = validateWork(works[i], i);
    if (err) return json({ error: err }, 400);
    if (slugs.has(works[i].slug)) return json({ error: `duplicate slug: ${works[i].slug}` }, 400);
    slugs.add(works[i].slug);
  }

  // Validate optional pending posters
  const pendingPosters: Array<{ slug: string; imageBase64: string }> = [];
  if (body.pendingPosters !== undefined) {
    if (!Array.isArray(body.pendingPosters)) return json({ error: 'pendingPosters must be array' }, 400);
    for (let i = 0; i < body.pendingPosters.length; i++) {
      const p = body.pendingPosters[i] as any;
      if (!p || typeof p !== 'object') return json({ error: `pendingPosters[${i}]: not object` }, 400);
      if (!isString(p.slug) || !/^[\p{L}\p{N}\-]+$/u.test(p.slug))
        return json({ error: `pendingPosters[${i}]: invalid slug` }, 400);
      if (!slugs.has(p.slug))
        return json({ error: `pendingPosters[${i}]: slug "${p.slug}" not in works array` }, 400);
      if (!isString(p.imageBase64) || p.imageBase64.length < 32)
        return json({ error: `pendingPosters[${i}]: invalid imageBase64` }, 400);
      pendingPosters.push({ slug: p.slug, imageBase64: p.imageBase64 });
    }
  }

  // Normalize: strip undefined, keep field order stable
  const normalized = works.map(normalize);
  const newJson = JSON.stringify(normalized, null, 2) + '\n';

  const gh = new GitHub(token, repo);

  try {
    const ref = await gh.getRef(BRANCH);
    const baseCommit = await gh.getCommit(ref.object.sha);

    // Build tree: works.json + all pending poster files
    const treeEntries: any[] = [];

    const worksBlobSha = await gh.createBlob(newJson, 'utf-8');
    treeEntries.push({ path: WORKS_JSON_PATH, mode: '100644', type: 'blob', sha: worksBlobSha });

    for (const p of pendingPosters) {
      const imageContent = p.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const blobSha = await gh.createBlob(imageContent, 'base64');
      treeEntries.push({
        path: `public/stills/covers/official/${p.slug}.jpg`,
        mode: '100644',
        type: 'blob',
        sha: blobSha,
      });
    }

    const treeSha = await gh.createTree(baseCommit.tree.sha, treeEntries);

    const posterCount = pendingPosters.length;
    const commitMessage = posterCount
      ? `admin: update works.json (${normalized.length} works) + ${posterCount} poster${posterCount > 1 ? 's' : ''}`
      : `admin: update works.json (${normalized.length} works)`;
    const commitSha = await gh.createCommit(commitMessage, treeSha, [ref.object.sha]);
    await gh.updateRef(BRANCH, commitSha);

    return json({
      ok: true,
      commit: commitSha,
      url: `https://github.com/${repo}/commit/${commitSha}`,
      count: normalized.length,
      posters: posterCount,
    });
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 502);
  }
};

function normalize(w: Work): Work {
  const out: Work = {
    slug: w.slug,
    titleZh: w.titleZh,
    categories: w.categories,
    primaryCategory: w.primaryCategory,
  };
  if (w.titleEn) out.titleEn = w.titleEn;
  if (w.year) out.year = w.year;
  if (w.director) out.director = w.director;
  if (w.writers) out.writers = w.writers;
  if (w.description) out.description = w.description;
  if (w.cover) out.cover = w.cover;
  if (w.coverOriginal) out.coverOriginal = w.coverOriginal;
  if (w.covers && w.covers.length) out.covers = w.covers;
  if (w.links && w.links.length) {
    out.links = w.links.map((l) => {
      const link: Link = { type: l.type, url: l.url };
      if (l.label) link.label = l.label;
      return link;
    });
  }
  if (w.hasDetail) out.hasDetail = true;
  return out;
}

class GitHub {
  private headers: Record<string, string>;
  private apiBase: string;

  constructor(token: string, repo: string) {
    this.apiBase = `https://api.github.com/repos/${repo}`;
    this.headers = {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'lth-portfolio-admin',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    };
  }

  private async call(method: string, path: string, body?: unknown) {
    const [rawPath, query = ''] = path.split('?');
    const encodedPath = rawPath
      .split('/')
      .map((seg) => (seg ? encodeURIComponent(seg) : seg))
      .join('/');
    const url = `${this.apiBase}${encodedPath}${query ? '?' + query : ''}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${t}`);
    }
    return res.json();
  }

  getRef(branch: string) {
    return this.call('GET', `/git/refs/heads/${branch}`) as Promise<{ object: { sha: string } }>;
  }

  getCommit(sha: string) {
    return this.call('GET', `/git/commits/${sha}`) as Promise<{ tree: { sha: string } }>;
  }

  async createBlob(content: string, encoding: 'utf-8' | 'base64'): Promise<string> {
    const res = (await this.call('POST', '/git/blobs', { content, encoding })) as { sha: string };
    return res.sha;
  }

  async createTree(baseSha: string, tree: unknown[]): Promise<string> {
    const res = (await this.call('POST', '/git/trees', { base_tree: baseSha, tree })) as { sha: string };
    return res.sha;
  }

  async createCommit(message: string, treeSha: string, parents: string[]): Promise<string> {
    const res = (await this.call('POST', '/git/commits', {
      message,
      tree: treeSha,
      parents,
      committer: { name: 'LTH Portfolio Admin', email: ALLOWED_EMAIL },
    })) as { sha: string };
    return res.sha;
  }

  updateRef(branch: string, sha: string) {
    return this.call('PATCH', `/git/refs/heads/${branch}`, { sha, force: false });
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
