import { describe, it, expect } from 'vitest';
import {
  validatePostPayload,
  validateStoryPayload,
  isValidPostId,
  isValidStoryId,
  ValidationError,
} from '../src/lib/validation';

describe('validatePostPayload', () => {
  const valid = {
    title: 'Пам\'ятаємо',
    content: 'Текст допису...',
    media: ['media/posts/photo.jpg'],
    author: 'moment_of_honor',
    publishedAt: '2026-08-15T10:00:00Z',
  };

  it('accepts a valid payload', () => {
    expect(validatePostPayload(valid)).toEqual(valid);
  });

  it('defaults media to an empty array when omitted', () => {
    const { media, ...rest } = valid;
    expect(validatePostPayload(rest).media).toEqual([]);
  });

  it('rejects an empty title', () => {
    expect(() => validatePostPayload({ ...valid, title: '' })).toThrow(ValidationError);
  });

  it('rejects media paths outside media/posts/', () => {
    expect(() => validatePostPayload({ ...valid, media: ['media/stories/x.jpg'] })).toThrow(ValidationError);
  });

  it('rejects an invalid publishedAt', () => {
    expect(() => validatePostPayload({ ...valid, publishedAt: 'not-a-date' })).toThrow(ValidationError);
  });
});

describe('validateStoryPayload', () => {
  const valid = {
    media: ['media/stories/photo.jpg'],
    publishedAt: '2026-08-15T12:00:00Z',
    expiresAt: '2026-08-16T12:00:00Z',
  };

  it('accepts a valid payload', () => {
    expect(validateStoryPayload(valid)).toEqual({ ...valid, author: undefined });
  });

  it('rejects an empty media array', () => {
    expect(() => validateStoryPayload({ ...valid, media: [] })).toThrow(ValidationError);
  });

  it('rejects expiresAt before publishedAt', () => {
    expect(() =>
      validateStoryPayload({ ...valid, expiresAt: '2026-08-14T12:00:00Z' }),
    ).toThrow(ValidationError);
  });
});

describe('id patterns', () => {
  it('validates post ids', () => {
    expect(isValidPostId('2026-08-15-example')).toBe(true);
    expect(isValidPostId('not-an-id')).toBe(false);
  });

  it('validates story ids', () => {
    expect(isValidStoryId('2026-08-15-01')).toBe(true);
    expect(isValidStoryId('2026-08-15-example')).toBe(false);
  });
});
