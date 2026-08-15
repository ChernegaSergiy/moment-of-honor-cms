// Implements POST /webhook/github. Verifies the GitHub webhook signature,
// then, on a push to the content repository's default branch, purges the
// edge feed cache so the next GET /feed.json fetches the freshly generated
// feed.json rather than serving a stale cached copy.

import { Hono } from 'hono';
import type { Env } from '../types/env';
import { purgeCachedFeed } from '../lib/feedCache';

const webhook = new Hono<{ Bindings: Env }>();

async function verifySignature(secret: string, body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = `sha256=${[...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

  if (expected.length !== signatureHeader.length) return false;

  // Constant-time comparison.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return mismatch === 0;
}

webhook.post('/github', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Hub-Signature-256');

  const valid = await verifySignature(c.env.GITHUB_WEBHOOK_SECRET, rawBody, signature ?? null);
  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const event = c.req.header('X-GitHub-Event');

  if (event === 'push') {
    const payload = JSON.parse(rawBody) as { ref: string; repository: { name: string } };
    const isContentRepo = payload.repository.name === c.env.CONTENT_REPO_NAME;
    const isDefaultBranch = payload.ref === `refs/heads/${c.env.CONTENT_REPO_BRANCH}`;

    if (isContentRepo && isDefaultBranch) {
      await purgeCachedFeed();
    }
  }

  return c.json({ received: true });
});

export default webhook;
