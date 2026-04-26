// Cloudflare Pages Function: POST /admin/api/profile
// 寫入 src/data/profile.json

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';
const BRANCH = 'main';
const PROFILE_JSON_PATH = 'src/data/profile.json';

interface Language {
  level: string;
  name: string;
}

interface Profile {
  nameZh: string;
  nameEn: string;
  roleZh: string;
  roleEn: string;
  leadZh: string;
  leadEn: string;
  subZh: string;
  subEn: string;
  languages: Language[];
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validate(p: any): string | null {
  if (!p || typeof p !== 'object') return 'profile must be object';
  for (const f of ['nameZh', 'nameEn', 'roleZh', 'roleEn', 'leadZh', 'leadEn', 'subZh', 'subEn']) {
    if (!isString(p[f])) return `${f} must be string`;
  }
  if (!Array.isArray(p.languages)) return 'languages must be array';
  for (let i = 0; i < p.languages.length; i++) {
    const l = p.languages[i];
    if (!l || typeof l !== 'object') return `languages[${i}]: not object`;
    if (!isString(l.level) || !l.level.trim()) return `languages[${i}]: level required`;
    if (!isString(l.name) || !l.name.trim()) return `languages[${i}]: name required`;
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return json({
      error: 'unauthorized',
      hint: 'CF Access 認證信箱不符或缺少 header — 試試右上角「登出」再重新登入',
      received_email: userEmail || '(無 cf-access-authenticated-user-email header — Access policy 未生效)',
      expected: ALLOWED_EMAIL,
    }, 401);
  }

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) return json({ error: 'missing GITHUB_TOKEN env' }, 500);

  let body: { profile?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const err = validate(body.profile);
  if (err) return json({ error: err }, 400);

  const profile = body.profile as Profile;
  const normalized: Profile = {
    nameZh: profile.nameZh.trim(),
    nameEn: profile.nameEn.trim(),
    roleZh: profile.roleZh.trim(),
    roleEn: profile.roleEn.trim(),
    leadZh: profile.leadZh.trim(),
    leadEn: profile.leadEn.trim(),
    subZh: profile.subZh.trim(),
    subEn: profile.subEn.trim(),
    languages: profile.languages.map((l) => ({ level: l.level.trim(), name: l.name.trim() })),
  };

  const newJson = JSON.stringify(normalized, null, 2) + '\n';
  const gh = new GitHub(token, repo);

  try {
    const ref = await gh.getRef(BRANCH);
    const baseCommit = await gh.getCommit(ref.object.sha);
    const blobSha = await gh.createBlob(newJson, 'utf-8');
    const treeSha = await gh.createTree(baseCommit.tree.sha, [
      { path: PROFILE_JSON_PATH, mode: '100644', type: 'blob', sha: blobSha },
    ]);
    const commitSha = await gh.createCommit('admin: update profile', treeSha, [ref.object.sha]);
    await gh.updateRef(BRANCH, commitSha);

    return json({
      ok: true,
      commit: commitSha,
      url: `https://github.com/${repo}/commit/${commitSha}`,
    });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 502);
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
    const url = `${this.apiBase}${path}`;
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
