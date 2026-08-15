// Implements GET /feed.json — the only endpoint the "Хвилина мовчання"
// client talks to. Served from the edge cache; falls back to reading
// feed.json from the content repository on a cache miss (e.g. right after
// deployment, before the first webhook-triggered refresh).

import { Hono } from 'hono';
import type { Env } from '../types/env';
import { getCachedFeed, putCachedFeed } from '../lib/feedCache';
import { getContentRepoInstallationId, getInstallationToken } from '../lib/githubApp';
import { readFile } from '../lib/github';

const feed = new Hono<{ Bindings: Env }>();

feed.get('/', async (c) => {
  const cached = await getCachedFeed();
  if (cached) return cached;

  const installationId = await getContentRepoInstallationId(c.env);
  const token = await getInstallationToken(c.env, installationId);
  const file = await readFile(c.env, token, 'feed.json');

  if (!file) {
    return c.json({ error: 'Feed not available' }, 503);
  }

  await putCachedFeed(file.content);
  return c.body(file.content, 200, { 'Content-Type': 'application/json' });
});

export default feed;
