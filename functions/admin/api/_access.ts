// Verify the Cloudflare Access JWT ourselves.
// Deployment URLs like xxxx.lth-portfolio.pages.dev are not behind Access, so this check is
// the only guard there: the certs URL, issuer and audience are pinned instead of trusting
// whatever the token claims, and the edge-injected email header is not trusted on its own.

const TEAM_DOMAIN = 'https://lthfilmstudio.cloudflareaccess.com';
const CERTS_URL = `${TEAM_DOMAIN}/cdn-cgi/access/certs`;
// Access application AUD for lthfilmstudio.com /admin (not a secret)
const ACCESS_AUD = '9c167bb0743ff1a64159275667c923963c2899a55cd0ad754cd3d5e6099a14aa';

function decodeBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return atob(padded);
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

interface JWKS {
  keys: Array<{ kid: string; kty: string; n: string; e: string; alg?: string }>;
}

let jwksCache: { fetched: number; data: JWKS } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(): Promise<JWKS | null> {
  if (jwksCache && Date.now() - jwksCache.fetched < JWKS_TTL_MS) return jwksCache.data;
  try {
    const res = await fetch(CERTS_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as JWKS;
    jwksCache = { fetched: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

export async function getAccessEmail(request: Request): Promise<string | null> {
  const jwt = getCookie(request, 'CF_Authorization') || request.headers.get('cf-access-jwt-assertion');
  if (!jwt) return null;

  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: { email?: string; iss?: string; aud?: string | string[]; exp?: number };
  try {
    header = JSON.parse(decodeBase64Url(headerB64));
    payload = JSON.parse(decodeBase64Url(payloadB64));
  } catch {
    return null;
  }

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (header.alg !== 'RS256' || !header.kid) return null;
  if (payload.iss !== TEAM_DOMAIN || !aud.includes(ACCESS_AUD)) return null;
  if (!payload.email || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  const jwks = await getJwks();
  if (!jwks) return null;
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = Uint8Array.from(decodeBase64Url(sigB64), (c) => c.charCodeAt(0));
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sigBytes, data);
    if (!valid) return null;
  } catch {
    return null;
  }

  return payload.email;
}
