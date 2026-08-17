// Implements GET/POST /api/stories, PUT/DELETE /api/stories/:id.
// Mirrors src/routes/posts.ts but for the story content type.

import { Hono } from 'hono';
import type { Env } from '../types/env';
import type { Story } from '../types/content';
import { readFile, writeFile, deleteFile, listDirectory } from '../lib/github';
import { validateStoryPayload, isValidStoryId } from '../lib/validation';
import { getJsonBody } from '../lib/waf';

const stories = new Hono<{
  Bindings: Env;
  Variables: { author: { login: string; id: number }; installationToken: string };
}>();

const AUTHOR_EMAIL_DOMAIN = 'users.noreply.github.com';

function storyPath(id: string) {
  return `content/stories/${id}.json`;
}

function nextStorySequence(existingIds: string[], datePrefix: string): string {
  const todays = existingIds
    .filter((id) => id.startsWith(datePrefix))
    .map((id) => Number(id.slice(-2)))
    .filter((n) => !Number.isNaN(n));
  const next = todays.length > 0 ? Math.max(...todays) + 1 : 1;
  return String(next).padStart(2, '0');
}

stories.get('/', async (c) => {
  const token = c.get('installationToken');
  const entries = await listDirectory(c.env, token, 'content/stories');

  const items: Story[] = [];
  for (const entry of entries.filter((e) => e.type === 'file' && e.name.endsWith('.json'))) {
    const file = await readFile(c.env, token, entry.path);
    if (file) items.push(JSON.parse(file.content) as Story);
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return c.json(items);
});

stories.post('/', async (c) => {
  const author = c.get('author');
  const token = c.get('installationToken');

  let payload;
  try {
    payload = validateStoryPayload(await getJsonBody(c));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const datePrefix = payload.publishedAt.slice(0, 10);
  const entries = await listDirectory(c.env, token, 'content/stories');
  const existingIds = entries.filter((e) => e.type === 'file').map((e) => e.name.replace('.json', ''));
  const sequence = nextStorySequence(existingIds, datePrefix);
  const id = `${datePrefix}-${sequence}`;

  const story: Story = { id, type: 'story', ...payload };

  await writeFile(
    c.env,
    token,
    storyPath(id),
    `${JSON.stringify(story, null, 2)}\n`,
    `Create story: ${id}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
  );

  return c.json(story, 201);
});

stories.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!isValidStoryId(id)) return c.json({ error: 'Invalid story id' }, 400);

  const author = c.get('author');
  const token = c.get('installationToken');

  const existing = await readFile(c.env, token, storyPath(id));
  if (!existing) return c.json({ error: 'Story not found' }, 404);

  let payload;
  try {
    payload = validateStoryPayload(await getJsonBody(c));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const story: Story = { id, type: 'story', ...payload };

  await writeFile(
    c.env,
    token,
    storyPath(id),
    `${JSON.stringify(story, null, 2)}\n`,
    `Update story: ${id}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
    existing.sha,
  );

  return c.json(story);
});

stories.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const author = c.get('author');
  const token = c.get('installationToken');

  const existing = await readFile(c.env, token, storyPath(id));
  if (!existing) return c.json({ error: 'Story not found' }, 404);

  await deleteFile(
    c.env,
    token,
    storyPath(id),
    `Delete story: ${id}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
    existing.sha,
  );

  return c.body(null, 204);
});

export default stories;
