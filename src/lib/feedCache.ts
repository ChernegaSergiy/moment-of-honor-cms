// Wraps the Cloudflare Cache API so feed.json can be served from the edge
// without hitting GitHub on every client request.

const FEED_CACHE_KEY = 'https://cache.moment-of-honor.internal/feed.json';
const FEED_CACHE_TTL_SECONDS = 60;

export async function getCachedFeed(): Promise<Response | null> {
  const cache = caches.default;
  const cached = await cache.match(FEED_CACHE_KEY);
  return cached ?? null;
}

export async function putCachedFeed(body: string): Promise<void> {
  const cache = caches.default;
  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${FEED_CACHE_TTL_SECONDS}`,
    },
  });
  await cache.put(FEED_CACHE_KEY, response);
}

export async function purgeCachedFeed(): Promise<void> {
  const cache = caches.default;
  await cache.delete(FEED_CACHE_KEY);
}
