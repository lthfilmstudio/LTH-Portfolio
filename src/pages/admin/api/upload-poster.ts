import type { APIRoute } from 'astro';

export const prerender = false;

const ALLOWED_EMAIL = 'lthfilmstudio@gmail.com';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};

  const userEmail = request.headers.get('cf-access-authenticated-user-email');
  if (!userEmail || userEmail.toLowerCase() !== ALLOWED_EMAIL) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const token = env.GITHUB_TOKEN || import.meta.env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || import.meta.env.GITHUB_REPO || 'lthfilmstudio/LTH-Portfolio';
  if (!token) {
    return new Response(JSON.stringify({ error: 'missing GITHUB_TOKEN' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { slug?: string; imageBase64?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { slug, imageBase64 } = body;
  if (!slug || !imageBase64) {
    return new Response(JSON.stringify({ error: 'missing slug or imageBase64' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response(JSON.stringify({ error: 'invalid slug' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

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
    const errText = await head.text();
    return new Response(JSON.stringify({ error: `github GET failed: ${head.status}`, detail: errText }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
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
    const errText = await putRes.text();
    return new Response(JSON.stringify({ error: `github PUT failed: ${putRes.status}`, detail: errText }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const result = (await putRes.json()) as { commit?: { sha?: string; html_url?: string } };
  return new Response(
    JSON.stringify({
      ok: true,
      commit: result.commit?.sha,
      url: result.commit?.html_url,
      path,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
