// Minimal signed-cookie session store. The session payload is JSON,
// base64url-encoded and signed with HMAC-SHA256 using SESSION_SECRET, so it
// can be verified statelessly without a server-side session store.

import { base64UrlEncode, base64UrlDecode, signPayload, verifySignedValue } from './crypto';

export interface AuthorSession {
  githubLogin: string;
  githubId: number;
  installationId: string;
  issuedAt: number;
}

const COOKIE_NAME = 'moh_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export async function createSessionCookie(session: AuthorSession, secret: string): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(session)));
  const value = await signPayload(payload, secret);

  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function readSession(cookieHeader: string | null, secret: string): Promise<AuthorSession | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const payload = await verifySignedValue(match[1] ?? '', secret);
  if (!payload) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as AuthorSession;
    if (Date.now() / 1000 - session.issuedAt > MAX_AGE_SECONDS) return null;
    return session;
  } catch {
    return null;
  }
}
