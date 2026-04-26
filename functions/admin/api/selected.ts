// Cloudflare Pages Function: POST /admin/api/selected
// Atomically replaces src/data/selected.json with the posted slug array.
// Protected by Cloudflare Access on /admin path.

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';
const BRANCH = 'main';
const SELECTED_PATH = 'src/data/selected.json';
const WORKS_PATH = 'src/data/works.json';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return json({
      error: 'unauthorized',
      hint: 'CF Access 認證信箱不符或缺少 header — 試試右上角「登出」再重新登入',
      received_email: userEmail || '(無 cf-access-authenticated-user-email header)',
      expected: ALLOWED_EMAIL,
    }, 401);
  }

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) return json({ error: 'missing GITHUB_TOKEN env' }, 500);

  let body: { slugs?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (!Array.isArray(body.slugs)) return json({ error: 'slugs must be array' }, 400);
  const slugs = body.slugs as string[];
  if (slugs.length === 0) return json({ error: '至少要有一個精選作品' }, 400);
  if (slugs.length > 10) return json({ error: '最多只能選 10 部' }, 400);

  const seen = new Set<string>();
  for (const s of slugs) {
    if (typeof s !== 'string' || !/^[\p{L}\p{N}\-]+$/u.test(s))
      return json({ error: `invalid slug: ${s}` }, 400);
    if (seen.has(s)) return json({ error: `duplicate slug: ${s}` }, 400);
    seen.add(s);
  }

  const gh = new GitHub(token, repo);

  try {
    // Cross-check that every slug exists in works.json
    const worksJson = await gh.getFileContent(WORKS_PATH, BRANCH);
    const works = JSON.parse(worksJson) as Array<{ slug: string }>;
    const validSlugs = new Set(works.map((w) => w.slug));
    for (const s of slugs) {
      if (!validSlugs.has(s)) return json({ error: `slug 不存在於作品庫：${s}` }, 400);
    }

    const ref = await gh.getRef(BRANCH);
    const baseCommit = await gh.getCommit(ref.object.sha);

    const newJson = JSON.stringify(slugs, null, 2) + '\n';
    const blobSha = await gh.createBlob(newJson, 'utf-8');
    const treeSha = await gh.createTree(baseCommit.tree.sha, [
      { path: SELECTED_PATH, mode: '100644', type: 'blob', sha: blobSha },
    ]);

    const commitSha = await gh.createCommit(
      `admin: update selected works (${slugs.length} entries)`,
      treeSha,
      [ref.object.sha],
    );
    await gh.updateRef(BRANCH, commitSha);

    return json({
      ok: true,
      commit: commitSha,
      url: `https://github.com/${repo}/commit/${commitSha}`,
      count: slugs.length,
    });
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 502);
  }
};

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

  async getFileContent(path: string, branch: string): Promise<string> {
    const res = (await this.call('GET', `/contents/${path}?ref=${branch}`)) as { content: string; encoding: string };
    if (res.encoding === 'base64') {
      return new TextDecoder().decode(
        Uint8Array.from(atob(res.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)),
      );
    }
    return res.content;
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
