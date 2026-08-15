import { describe, it, expect, vi } from 'vitest';
import { createOAuthState, verifyOAuthState, isAllowedReturnTo } from '../src/lib/oauthState';

const SECRET = 'test-secret';

describe('createOAuthState / verifyOAuthState', () => {
  it('round-trips a returnTo URL', async () => {
    const state = await createOAuthState('https://dashboard.example/', SECRET);
    const verified = await verifyOAuthState(state, SECRET);

    expect(verified?.returnTo).toBe('https://dashboard.example/');
  });

  it('round-trips with no returnTo', async () => {
    const state = await createOAuthState(undefined, SECRET);
    const verified = await verifyOAuthState(state, SECRET);

    expect(verified?.returnTo).toBeUndefined();
  });

  it('rejects a tampered state', async () => {
    const state = await createOAuthState('https://dashboard.example/', SECRET);
    const midpoint = Math.floor(state.length / 2);
    const flipped = state[midpoint] === 'a' ? 'b' : 'a';
    const tampered = state.slice(0, midpoint) + flipped + state.slice(midpoint + 1);

    expect(await verifyOAuthState(tampered, SECRET)).toBeNull();
  });

  it('rejects a state signed with a different secret', async () => {
    const state = await createOAuthState('https://dashboard.example/', SECRET);

    expect(await verifyOAuthState(state, 'wrong-secret')).toBeNull();
  });

  it('rejects an expired state', async () => {
    vi.useFakeTimers();
    const state = await createOAuthState('https://dashboard.example/', SECRET);

    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(await verifyOAuthState(state, SECRET)).toBeNull();

    vi.useRealTimers();
  });
});

describe('isAllowedReturnTo', () => {
  const allowed = ['https://dashboard.example'];

  it('accepts a URL on an allowed origin', () => {
    expect(isAllowedReturnTo('https://dashboard.example/settings', allowed)).toBe(true);
  });

  it('rejects a URL on a different origin', () => {
    expect(isAllowedReturnTo('https://evil.example/', allowed)).toBe(false);
  });

  it('rejects an invalid URL', () => {
    expect(isAllowedReturnTo('not-a-url', allowed)).toBe(false);
  });
});
