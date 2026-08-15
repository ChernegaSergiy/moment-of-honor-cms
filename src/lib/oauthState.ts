// Signs and verifies the OAuth `state` parameter passed through GitHub's
// authorization flow. Carries an optional `returnTo` URL (the dashboard
// origin to redirect back to after sign-in) plus a nonce, both covered by
// an HMAC signature so the value can't be tampered with in transit — this
// is what keeps `returnTo` from becoming an open redirect, and doubles as
// CSRF protection for the OAuth flow itself.

import { base64UrlEncode, base64UrlDecode, signPayload, verifySignedValue } from './crypto';

export interface OAuthState {
  returnTo?: string;
  nonce: string;
  issuedAt: number;
}

const MAX_AGE_SECONDS = 10 * 60; // 10 minutes, generous for a login round-trip

export async function createOAuthState(returnTo: string | undefined, secret: string): Promise<string> {
  const state: OAuthState = {
    returnTo,
    nonce: crypto.randomUUID(),
    issuedAt: Math.floor(Date.now() / 1000),
  };

  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(state)));
  return signPayload(payload, secret);
}

export async function verifyOAuthState(value: string, secret: string): Promise<OAuthState | null> {
  const payload = await verifySignedValue(value, secret);
  if (!payload) return null;

  try {
    const state = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as OAuthState;
    if (Math.floor(Date.now() / 1000) - state.issuedAt > MAX_AGE_SECONDS) return null;
    return state;
  } catch {
    return null;
  }
}

/** True if `url`'s origin is in the ALLOWED_ORIGINS list, guarding against open redirects. */
export function isAllowedReturnTo(url: string, allowedOrigins: string[]): boolean {
  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
