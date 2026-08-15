// Requires a valid signed session cookie and attaches the author's session
// and a ready-to-use installation access token to the request context.

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env';
import { readSession } from '../lib/session';
import { getInstallationToken } from '../lib/githubApp';

export function requireAuthor(): MiddlewareHandler<{
  Bindings: Env;
  Variables: { author: { login: string; id: number }; installationToken: string };
}> {
  return async (c, next) => {
    const session = await readSession(c.req.header('Cookie') ?? null, c.env.SESSION_SECRET);

    if (!session) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const installationToken = await getInstallationToken(c.env, session.installationId);

    c.set('author', { login: session.githubLogin, id: session.githubId });
    c.set('installationToken', installationToken);

    await next();
  };
}
