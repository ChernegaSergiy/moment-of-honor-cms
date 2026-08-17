// Implements GET/POST /api/posts, GET/PUT/DELETE /api/posts/:id.
//
// All writes go through the App's installation token, never the author's
// personal OAuth token, so the client never needs direct GitHub API access.

import { Hono } from 'hono';
import type { Env } from '../types/env';
import type { Post } from '../types/content';
import { readFile, writeFile, deleteFile, listDirectory } from '../lib/github';
import { validatePostPayload, isValidPostId } from '../lib/validation';


const posts = new Hono<{
  Bindings: Env;
  Variables: { author: { login: string; id: number }; installationToken: string };
}>();

const AUTHOR_EMAIL_DOMAIN = 'users.noreply.github.com';

function postPath(id: string) {
  return `content/posts/${id}.json`;
}

posts.get('/', async (c) => {
  const token = c.get('installationToken');
  const entries = await listDirectory(c.env, token, 'content/posts');

  const items: Post[] = [];
  for (const entry of entries.filter((e) => e.type === 'file' && e.name.endsWith('.json'))) {
    const file = await readFile(c.env, token, entry.path);
    if (file) items.push(JSON.parse(file.content) as Post);
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return c.json(items);
});

posts.post('/', async (c) => {
  const author = c.get('author');
  const token = c.get('installationToken');

  let payload;
  try {
    payload = validatePostPayload(await c.req.json().catch(() => null));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const id = `${payload.publishedAt.slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const post: Post = { id, type: 'post', ...payload };

  await writeFile(
    c.env,
    token,
    postPath(id),
    `${JSON.stringify(post, null, 2)}\n`,
    `Create post: ${post.title}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
  );

  return c.json(post, 201);
});

posts.get('/:id', async (c) => {
  const id = c.req.param('id');
  const token = c.get('installationToken');

  const file = await readFile(c.env, token, postPath(id));
  if (!file) return c.json({ error: 'Post not found' }, 404);

  return c.json(JSON.parse(file.content));
});

posts.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isValidPostId(id)) return c.json({ error: 'Invalid post id' }, 400);

  const author = c.get('author');
  const token = c.get('installationToken');

  const existing = await readFile(c.env, token, postPath(id));
  if (!existing) return c.json({ error: 'Post not found' }, 404);

  let payload;
  try {
    payload = validatePostPayload(await c.req.json().catch(() => null));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const post: Post = { id, type: 'post', ...payload, updatedAt: new Date().toISOString() };

  await writeFile(
    c.env,
    token,
    postPath(id),
    `${JSON.stringify(post, null, 2)}\n`,
    `Update post: ${post.title}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
    existing.sha,
  );

  return c.json(post);
});

posts.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const author = c.get('author');
  const token = c.get('installationToken');

  const existing = await readFile(c.env, token, postPath(id));
  if (!existing) return c.json({ error: 'Post not found' }, 404);

  await deleteFile(
    c.env,
    token,
    postPath(id),
    `Delete post: ${id}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
    existing.sha,
  );

  return c.body(null, 204);
});

export default posts;
