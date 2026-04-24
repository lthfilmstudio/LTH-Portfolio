// Cloudflare Pages Function: POST /admin/api/upload-poster
// Protected by Cloudflare Access at the /admin path.
// Atomically updates both the image file and works.json cover field in a single commit.

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';
const BRANCH = 'main';
const WORKS_JSON_PATH = 'src/data/works.json';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return json({ error: 'unauthorized' }, 401);
  }

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) return json({ error: 'missing GITHUB_TOKEN env' }, 500);

  let body: { slug?: string; imageBase64?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { slug, imageBase64 } = body;
  if (!slug || !imageBase64) return json({ error: 'missing slug or imageBase64' }, 400);
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'invalid slug' }, 400);

  const imageContent = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const imagePath = `public/stills/covers/official/${slug}.jpg`;
  const newCoverUrl = `/stills/covers/official/${slug}.jpg`;

  const gh = new GitHub(token, repo);

  try {
    // 1. Read current main ref + base tree
    const ref = await gh.getRef(BRANCH);
    const baseCommit = await gh.getCommit(ref.object.sha);

    // 2. Fetch current works.json and update the matching work's cover field
    const worksFile = await gh.getFileContent(WORKS_JSON_PATH, BRANCH);
    const works = JSON.parse(worksFile) as Array<{ slug: string; cover?: string }>;
    const target = works.find((w) => w.slug === slug);
    if (!target) {
      return json({ error: `slug not found in works.json: ${slug}` }, 404);
    }
    const coverChanged = target.cover !== newCoverUrl;
    target.cover = newCoverUrl;
    const newWorksJson = JSON.stringify(works, null, 2);

    // 3. Create blobs
    const imageBlobSha = await gh.createBlob(imageContent, 'base64');
    const worksBlobSha = coverChanged
      ? await gh.createBlob(newWorksJson, 'utf-8')
      : null;

    // 4. Create tree
    const treeEntries: any[] = [
      { path: imagePath, mode: '100644', type: 'blob', sha: imageBlobSha },
    ];
    if (worksBlobSha) {
      treeEntries.push({ path: WORKS_JSON_PATH, mode: '100644', type: 'blob', sha: worksBlobSha });
    }
    const newTreeSha = await gh.createTree(baseCommit.tree.sha, treeEntries);

    // 5. Create commit
    const commitMessage = coverChanged
      ? `admin: update poster for ${slug} + sync works.json cover`
      : `admin: update poster for ${slug}`;
    const newCommitSha = await gh.createCommit(commitMessage, newTreeSha, [ref.object.sha]);

    // 6. Update ref
    await gh.updateRef(BRANCH, newCommitSha);

    return json({
      ok: true,
      commit: newCommitSha,
      url: `https://github.com/${repo}/commit/${newCommitSha}`,
      path: imagePath,
      coverUpdated: coverChanged,
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
    const res = await fetch(`${this.apiBase}${path}`, {
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
