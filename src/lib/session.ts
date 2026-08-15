// Minimal signed-cookie session store. The session payload is JSON,
// base64url-encoded and signed with HMAC-SHA256 using SESSION_SECRET, so it
// can be verified statelessly without a server-side session store.

export interface AuthorSession {
  githubLogin: string;
  githubId: number;
  installationId: string;
  issuedAt: number;
}

const COOKIE_NAME = 'moh_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSessionCookie(session: AuthorSession, secret: string): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(session)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const value = `${payload}.${base64UrlEncode(signature)}`;

  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function readSession(cookieHeader: string | null, secret: string): Promise<AuthorSession | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const [payload, signature] = match[1].split('.');
  if (!payload || !signature) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signature),
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as AuthorSession;
    if (Date.now() / 1000 - session.issuedAt > MAX_AGE_SECONDS) return null;
    return session;
  } catch {
    return null;
  }
}
