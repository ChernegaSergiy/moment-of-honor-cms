// Implements POST /api/media. Accepts a multipart/form-data upload and
// commits the file under media/posts/ or media/stories/, returning the
// repository-relative path to reference from a post or story document.

import { Hono } from 'hono';
import type { Env } from '../types/env';
import { writeFile, listDirectory, deleteFile } from '../lib/github';

const media = new Hono<{
  Bindings: Env;
  Variables: { author: { login: string; id: number }; installationToken: string };
}>();

const AUTHOR_EMAIL_DOMAIN = 'users.noreply.github.com';
const ALLOWED_KINDS = new Set(['posts', 'stories']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'mp4']);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

function bufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

media.get('/', async (c) => {
  const token = c.get('installationToken');
  const kind = c.req.query('kind');

  if (kind && !ALLOWED_KINDS.has(kind)) {
    return c.json({ error: '"kind" must be one of: posts, stories' }, 400);
  }

  const paths: string[] = [];
  const kindsToFetch = kind ? [kind] : Array.from(ALLOWED_KINDS);

  for (const k of kindsToFetch) {
    const entries = await listDirectory(c.env, token, `media/${k}`);
    paths.push(...entries.filter((e) => e.type === 'file').map((e) => e.path));
  }

  return c.json(paths);
});

media.post('/', async (c) => {
  const author = c.get('author');
  const token = c.get('installationToken');

  const form = await c.req.formData();
  const fileEntry = form.get('file');
  const kind = form.get('kind');

  const file = fileEntry as File | null;
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: '"file" field is required' }, 400);
  }
  if (typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
    return c.json({ error: '"kind" must be one of: posts, stories' }, 400);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return c.json({ error: 'File exceeds the 20MB limit' }, 413);
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return c.json({ error: `Unsupported file extension: ${extension}` }, 400);
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  const path = `media/${kind}/${filename}`;

  const buffer = await file.arrayBuffer();
  const binaryContent = bufferToBinaryString(buffer);

  // writeFile base64-encodes its `content` argument for us, so we pass the
  // raw binary string here rather than pre-encoding it.
  await writeFile(
    c.env,
    token,
    path,
    binaryContent,
    `Add media: ${filename}`,
    author.login,
    `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
  );

  return c.json({ path }, 201);
});

media.delete('/', async (c) => {
  const author = c.get('author');
  const token = c.get('installationToken');
  
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.path !== 'string') {
    return c.json({ error: 'Missing or invalid "path"' }, 400);
  }
  const path = body.path;
  
  if (!path.startsWith('media/posts/') && !path.startsWith('media/stories/')) {
    return c.json({ error: 'Invalid media path' }, 400);
  }
  
  const dirPath = path.substring(0, path.lastIndexOf('/'));
  const entries = await listDirectory(c.env, token, dirPath);
  const fileEntry = entries.find((e) => e.path === path);
  
  if (!fileEntry) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  try {
    await deleteFile(
      c.env,
      token,
      path,
      `Delete media: ${path.split('/').pop()}`,
      author.login,
      `${author.id}+${author.login}@${AUTHOR_EMAIL_DOMAIN}`,
      fileEntry.sha
    );
    return c.json({ success: true });
  } catch (err: any) {
    throw err;
  }
});

export default media;
