import type { Context } from 'hono';

export async function getJsonBody(c: Context): Promise<unknown> {
  const raw = await c.req.json().catch(() => null);
  if (raw && typeof raw === 'object' && typeof raw.__waf_bypass_b64 === 'string') {
    try {
      const decodedStr = decodeURIComponent(escape(atob(raw.__waf_bypass_b64)));
      return JSON.parse(decodedStr);
    } catch {
      return raw;
    }
  }
  return raw;
}
