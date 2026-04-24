// Cloudflare Pages Function: POST /admin/api/upload-poster
// Protected by Cloudflare Access at the /admin path.

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
}

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return json({ error: 'unauthorized' }, 401);
  }

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) {
    return json({ error: 'missing GITHUB_TOKEN env' }, 500);
  }

  let body: { slug?: string; imageBase64?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { slug, imageBase64 } = body;
  if (!slug || !imageBase64) return json({ error: 'missing slug or imageBase64' }, 400);
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'invalid slug' }, 400);

  const content = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const path = `public/stills/covers/official/${slug}.jpg`;
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;

  const ghHeaders = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'lth-portfolio-admin',
    'x-github-api-version': '2022-11-28',
  };

  let existingSha: string | undefined;
  const head = await fetch(api, { headers: ghHeaders });
  if (head.ok) {
    const meta = (await head.json()) as { sha?: string };
    existingSha = meta.sha;
  } else if (head.status !== 404) {
    return json({ error: `github GET failed: ${head.status}`, detail: await head.text() }, 502);
  }

  const putRes = await fetch(api, {
    method: 'PUT',
    headers: { ...ghHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: `admin: update poster for ${slug}`,
      content,
      sha: existingSha,
      committer: { name: 'LTH Portfolio Admin', email: ALLOWED_EMAIL },
    }),
  });

  if (!putRes.ok) {
    return json({ error: `github PUT failed: ${putRes.status}`, detail: await putRes.text() }, 502);
  }

  const result = (await putRes.json()) as { commit?: { sha?: string; html_url?: string } };
  return json({
    ok: true,
    commit: result.commit?.sha,
    url: result.commit?.html_url,
    path,
  });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
