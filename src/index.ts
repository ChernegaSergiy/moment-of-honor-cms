import { Hono } from 'hono';
import type { Env } from './types/env';
import { rateLimit } from './middleware/rateLimit';
import { requireAuthor } from './middleware/auth';
import authRoutes from './routes/auth';
import postsRoutes from './routes/posts';
import storiesRoutes from './routes/stories';
import mediaRoutes from './routes/media';
import feedRoutes from './routes/feed';
import webhookRoutes from './routes/webhook';

const app = new Hono<{ Bindings: Env }>();

// Public, read-only surface — no auth, no rate limiting beyond edge caching.
app.route('/feed.json', feedRoutes);

// GitHub webhook — authenticated via signature verification, not sessions.
app.route('/webhook/github', webhookRoutes);

// Author-facing OAuth flow.
app.route('/auth', authRoutes);

// Administrative API — requires an authenticated author and is rate limited.
const api = new Hono<{
  Bindings: Env;
  Variables: { author: { login: string; id: number }; installationToken: string };
}>();
api.use('*', rateLimit());
api.use('*', requireAuthor());
api.route('/posts', postsRoutes);
api.route('/stories', storiesRoutes);
api.route('/media', mediaRoutes);
app.route('/api', api);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
