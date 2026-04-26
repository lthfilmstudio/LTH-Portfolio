// Verify CF Access JWT directly from CF_Authorization cookie.
// Used as a fallback because manual Self-Hosted Access Apps don't reliably
// inject cf-access-authenticated-user-email into Pages Functions.

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

const jwksCache = new Map<string, { fetched: number; data: JWKS }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(iss: string): Promise<JWKS | null> {
  const cached = jwksCache.get(iss);
  if (cached && Date.now() - cached.fetched < JWKS_TTL_MS) return cached.data;
  try {
    const res = await fetch(`${iss}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    const data = (await res.json()) as JWKS;
    jwksCache.set(iss, { fetched: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

export async function getAccessEmail(request: Request): Promise<string | null> {
  // Prefer Edge-injected header if present.
  const headerEmail = request.headers.get('cf-access-authenticated-user-email');
  if (headerEmail) return headerEmail;

  // Fallback: verify CF_Authorization cookie ourselves.
  const jwt = getCookie(request, 'CF_Authorization');
  if (!jwt) return null;

  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: { email?: string; iss?: string; exp?: number };
  try {
    header = JSON.parse(decodeBase64Url(headerB64));
    payload = JSON.parse(decodeBase64Url(payloadB64));
  } catch {
    return null;
  }

  if (!payload.email || !payload.iss || !payload.exp || !header.kid) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  const jwks = await getJwks(payload.iss);
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
