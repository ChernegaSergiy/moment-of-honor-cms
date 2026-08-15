// Lightweight runtime validation mirroring schema/post.schema.json and
// schema/story.schema.json from the content repository. Kept dependency-free
// to avoid pulling a JSON Schema validator into the Worker bundle.

import type { Post, Story } from '../types/content';

const POST_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
const STORY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-\d{2}$/;

export class ValidationError extends Error {}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function validatePostPayload(body: unknown): Omit<Post, 'id' | 'type'> {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.title) || b.title.length > 200) {
    throw new ValidationError('"title" must be a non-empty string up to 200 characters');
  }
  if (!isNonEmptyString(b.content)) {
    throw new ValidationError('"content" must be a non-empty string');
  }
  if (b.media !== undefined) {
    if (!Array.isArray(b.media) || !b.media.every((m) => typeof m === 'string' && m.startsWith('media/posts/'))) {
      throw new ValidationError('"media" must be an array of paths under media/posts/');
    }
  }
  if (!isNonEmptyString(b.author)) {
    throw new ValidationError('"author" must be a non-empty string');
  }
  if (!isIsoDateTime(b.publishedAt)) {
    throw new ValidationError('"publishedAt" must be an ISO 8601 date-time string');
  }

  return {
    title: b.title,
    content: b.content,
    media: (b.media as string[] | undefined) ?? [],
    author: b.author,
    publishedAt: b.publishedAt,
  };
}

export function validateStoryPayload(body: unknown): Omit<Story, 'id' | 'type'> {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (
    !Array.isArray(b.media) ||
    b.media.length === 0 ||
    !b.media.every((m) => typeof m === 'string' && m.startsWith('media/stories/'))
  ) {
    throw new ValidationError('"media" must be a non-empty array of paths under media/stories/');
  }
  if (!isIsoDateTime(b.publishedAt)) {
    throw new ValidationError('"publishedAt" must be an ISO 8601 date-time string');
  }
  if (!isIsoDateTime(b.expiresAt)) {
    throw new ValidationError('"expiresAt" must be an ISO 8601 date-time string');
  }
  if (new Date(b.expiresAt as string).getTime() <= new Date(b.publishedAt as string).getTime()) {
    throw new ValidationError('"expiresAt" must be after "publishedAt"');
  }

  return {
    media: b.media as string[],
    author: typeof b.author === 'string' ? b.author : undefined,
    publishedAt: b.publishedAt,
    expiresAt: b.expiresAt,
  };
}

export function isValidPostId(id: string): boolean {
  return POST_ID_PATTERN.test(id);
}

export function isValidStoryId(id: string): boolean {
  return STORY_ID_PATTERN.test(id);
}
