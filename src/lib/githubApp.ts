// Handles GitHub App authentication: signing short-lived App JWTs with the
// App's private key, and exchanging them for installation access tokens.
// Uses the Web Crypto API since Cloudflare Workers do not expose Node's
// `crypto` module.

import type { Env } from '../types/env';

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n');
  const base64 = normalized
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Creates a short-lived (10 minute) App-level JWT, per GitHub App auth spec. */
export async function createAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // allow for clock drift
    exp: now + 9 * 60,
    iss: env.GITHUB_APP_ID,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

/**
 * Returns a cached installation access token for the App's installation on
 * the content repository, requesting a new one from GitHub when the cached
 * token is missing or close to expiry.
 */
export async function getInstallationToken(env: Env, installationId: string): Promise<string> {
  const cacheKey = `installation-token:${installationId}`;
  const cached = await env.CACHE.get<InstallationTokenResponse>(cacheKey, 'json');

  if (cached && new Date(cached.expires_at).getTime() - Date.now() > 60_000) {
    return cached.token;
  }

  const appJwt = await createAppJwt(env);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'moment-of-honor-cms',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create installation token: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as InstallationTokenResponse;

  const ttlSeconds = Math.max(
    60,
    Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000) - 30,
  );
  await env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: ttlSeconds });

  return data.token;
}

/**
 * Resolves the installation ID for the App's installation on the configured
 * content repository. Cached for an hour since installations rarely change.
 */
export async function getContentRepoInstallationId(env: Env): Promise<string> {
  const cacheKey = `installation-id:${env.CONTENT_REPO_OWNER}/${env.CONTENT_REPO_NAME}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return cached;

  const appJwt = await createAppJwt(env);
  const response = await fetch(
    `https://api.github.com/repos/${env.CONTENT_REPO_OWNER}/${env.CONTENT_REPO_NAME}/installation`,
    {
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'moment-of-honor-cms',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to resolve installation: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { id: number };
  await env.CACHE.put(cacheKey, String(data.id), { expirationTtl: 3600 });

  return String(data.id);
}
