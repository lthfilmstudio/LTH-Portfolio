// Cloudflare Pages Function: POST /admin/api/awards
// Atomically saves the entire awards.json file via GitHub Trees API.

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';
const BRANCH = 'main';
const AWARDS_JSON_PATH = 'src/data/awards.json';

interface Award {
  id: string;
  workSlug?: string;
  status: 'win' | 'nom';
  statusZh: string;
  statusEn: string;
  year: string;
  workZh: string;
  workEn: string;
  awardZh: string;
  awardEn: string;
  poster?: string;
  posterX?: number;
  posterY?: number;
  posterScale?: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return json({ error: 'unauthorized' }, 401);
  }

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) return json({ error: 'missing GITHUB_TOKEN env' }, 500);

  let body: { awards?: Award[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { awards } = body;
  if (!Array.isArray(awards)) return json({ error: 'awards must be an array' }, 400);

  for (const a of awards) {
    if (!a.id || !/^[a-z0-9\-]+$/.test(a.id)) return json({ error: `invalid id: ${a.id}` }, 400);
    if (a.status !== 'win' && a.status !== 'nom') return json({ error: `invalid status for ${a.id}` }, 400);
    if (!a.workZh || !a.workEn || !a.awardZh || !a.awardEn || !a.year) {
      return json({ error: `missing required fields for ${a.id}` }, 400);
    }
    // workSlug 與 poster 至少要有一個（workSlug 走 works.json 查；poster 是 fallback/override）
    const hasSlug = typeof a.workSlug === 'string' && a.workSlug.length > 0;
    const hasPoster = typeof a.poster === 'string' && a.poster.startsWith('/');
    if (!hasSlug && !hasPoster) {
      return json({ error: `${a.id}: 至少要設 workSlug 或 poster 其中一個` }, 400);
    }
    if (hasSlug && !/^[\p{L}\p{N}\-]+$/u.test(a.workSlug!)) {
      return json({ error: `${a.id}: invalid workSlug "${a.workSlug}"` }, 400);
    }
    if (a.poster === undefined) a.poster = '';
    a.posterX = clamp(a.posterX ?? 50, 0, 100);
    a.posterY = clamp(a.posterY ?? 50, 0, 100);
    a.posterScale = clamp(a.posterScale ?? 100, 50, 250);
  }

  const ids = awards.map((a) => a.id);
  if (new Set(ids).size !== ids.length) return json({ error: 'duplicate id' }, 400);

  const newAwardsJson = JSON.stringify(awards, null, 2) + '\n';
  const gh = new GitHub(token, repo);

  try {
    const ref = await gh.getRef(BRANCH);
    const baseCommit = await gh.getCommit(ref.object.sha);

    const blobSha = await gh.createBlob(newAwardsJson, 'utf-8');
    const treeEntries = [
      { path: AWARDS_JSON_PATH, mode: '100644', type: 'blob', sha: blobSha },
    ];
    const newTreeSha = await gh.createTree(baseCommit.tree.sha, treeEntries);
    const commitSha = await gh.createCommit(
      `admin: update awards (${awards.length} entries)`,
      newTreeSha,
      [ref.object.sha],
    );
    await gh.updateRef(BRANCH, commitSha);

    return json({
      ok: true,
      commit: commitSha,
      url: `https://github.com/${repo}/commit/${commitSha}`,
      count: awards.length,
    });
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 502);
  }
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
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
