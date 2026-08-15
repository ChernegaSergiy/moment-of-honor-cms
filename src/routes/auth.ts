// Implements GET /auth/github and GET /auth/github/callback.
//
// The author is authenticated via standard GitHub OAuth. After exchanging
// the code for a user access token, we resolve the App installation on the
// content repository and confirm the authenticated user has access to it
// before issuing a session. The user's OAuth token itself is discarded —
// all subsequent writes use the App's installation token, never the
// author's personal token.

import { Hono } from 'hono';
import type { Env } from '../types/env';
import { createSessionCookie, clearSessionCookie } from '../lib/session';
import { getContentRepoInstallationId } from '../lib/githubApp';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState';
import { parseAllowedOrigins } from '../lib/allowedOrigins';

const auth = new Hono<{ Bindings: Env }>();

auth.get('/github', async (c) => {
  const returnTo = c.req.query('return_to');
  const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS ?? '');

  if (returnTo) {
    let returnToOrigin: string;
    try {
      returnToOrigin = new URL(returnTo).origin;
    } catch {
      return c.json({ error: 'Invalid return_to URL' }, 400);
    }
    if (!allowedOrigins.includes(returnToOrigin)) {
      return c.json({ error: 'return_to origin is not allowed' }, 400);
    }
  }

  const state = await createOAuthState(returnTo, c.env.SESSION_SECRET);
  const redirectUri = new URL('/auth/github/callback', c.req.url).toString();

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', c.env.GITHUB_APP_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  return c.redirect(authorizeUrl.toString(), 302);
});

interface OAuthTokenResponse {
  access_token?: string;
  error?: string;
}

interface GitHubUser {
  login: string;
  id: number;
}

auth.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.json({ error: 'Missing authorization code' }, 400);
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_APP_CLIENT_ID,
      client_secret: c.env.GITHUB_APP_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = (await tokenResponse.json()) as OAuthTokenResponse;
  if (!tokenData.access_token) {
    return c.json({ error: 'GitHub OAuth exchange failed' }, 401);
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'moment-of-honor-cms',
    },
  });

  if (!userResponse.ok) {
    return c.json({ error: 'Failed to fetch GitHub user' }, 401);
  }

  const user = (await userResponse.json()) as GitHubUser;

  // Confirm the App is installed on the content repository, and that this
  // user is one of the installation's authorized collaborators. Actual
  // write permission is still enforced by GitHub on every Contents API
  // call using the installation token, so this is a pre-flight check.
  let installationId: string;
  try {
    installationId = await getContentRepoInstallationId(c.env);
  } catch {
    return c.json({ error: 'Moment of Honor GitHub App is not installed on the content repository' }, 403);
  }

  const collaboratorCheck = await fetch(
    `https://api.github.com/repos/${c.env.CONTENT_REPO_OWNER}/${c.env.CONTENT_REPO_NAME}/collaborators/${user.login}`,
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'moment-of-honor-cms',
      },
    },
  );

  if (collaboratorCheck.status !== 204) {
    return c.json({ error: 'You do not have access to the content repository' }, 403);
  }

  const cookie = await createSessionCookie(
    {
      githubLogin: user.login,
      githubId: user.id,
      installationId,
      issuedAt: Math.floor(Date.now() / 1000),
    },
    c.env.SESSION_SECRET,
  );

  c.header('Set-Cookie', cookie);
  return c.json({ authenticated: true, login: user.login });
});

auth.post('/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie());
  return c.json({ authenticated: false });
});

export default auth;
