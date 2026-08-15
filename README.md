# Moment of Honor CMS

[![CI](https://github.com/ChernegaSergiy/moment-of-honor-cms/actions/workflows/ci.yml/badge.svg)](https://github.com/ChernegaSergiy/moment-of-honor-cms/actions/workflows/ci.yml)
[![Deploy](https://github.com/ChernegaSergiy/moment-of-honor-cms/actions/workflows/deploy.yml/badge.svg)](https://github.com/ChernegaSergiy/moment-of-honor-cms/actions/workflows/deploy.yml)

Serverless API and GitHub App backend for **Moment of Honor**, the content system behind the "Головна" feed in the "Хвилина мовчання" ("Minute of Silence") desktop application.

GitHub stores content, a GitHub App controls author access, this Worker isolates GitHub from the client, and the desktop app consumes a plain JSON feed.

```text
Authors ── GitHub OAuth ──▶ This Worker ── GitHub App ──▶ moment-of-honor-content
                                  │
                                  ▼
                            GET /feed.json ──▶ «Хвилина мовчання»
```

Content itself — posts, stories, media, and the generated `feed.json` — lives in the separate [`moment-of-honor-content`](https://github.com/ChernegaSergiy/moment-of-honor-content) repository, which this Worker reads from and writes to via the GitHub Contents API.

## Why a GitHub App, not a personal access token

The client and the CMS API never hold a long-lived GitHub credential. Authors sign in with standard GitHub OAuth only to prove they are collaborators on the content repository; every actual write uses a short-lived **installation access token** requested from the GitHub App, scoped to `Contents: Read & write` on that one repository. See [`src/lib/githubApp.ts`](src/lib/githubApp.ts).

## API

```http
GET  /auth/github
GET  /auth/github/callback
POST /auth/logout

GET    /api/posts
POST   /api/posts
GET    /api/posts/:id
PUT    /api/posts/:id
DELETE /api/posts/:id

GET    /api/stories
POST   /api/stories
PUT    /api/stories/:id
DELETE /api/stories/:id

POST /api/media

POST /webhook/github

GET /feed.json
```

`/api/*` requires an authenticated author session and is rate limited. `/feed.json` is public and read-only — this is the only endpoint the desktop client ever calls.

## Cross-origin clients (CORS)

The API is meant to be called from a separately hosted client — for example
[`moment-of-honor-dashboard`](https://github.com/ChernegaSergiy/moment-of-honor-dashboard),
a static site with its own origin. Two things make that work:

- **`ALLOWED_ORIGINS`** (a comma-separated list, set in [`wrangler.toml`](wrangler.toml))
  is checked by [`middleware/cors.ts`](src/middleware/cors.ts). Only listed
  origins get `Access-Control-Allow-Origin` echoed back with
  `Access-Control-Allow-Credentials: true`; every other origin gets no CORS
  headers at all, so the browser discards the response before any script on
  that origin can read it. This is what actually restricts credentialed
  access, not the cookie's `SameSite` attribute below.
- The session cookie is `SameSite=None; Secure`, which is required for any
  cross-origin use at all — `Lax` cookies are withheld from cross-origin
  `fetch()` calls regardless of CORS. Restricting *which* origins can
  succeed is entirely the job of `ALLOWED_ORIGINS`.

`GET /auth/github` accepts an optional `?return_to=` query parameter — the
URL to send the author back to after signing in. Its origin must be in
`ALLOWED_ORIGINS`, and it is carried through GitHub's OAuth `state`
parameter signed with `SESSION_SECRET` ([`lib/oauthState.ts`](src/lib/oauthState.ts)),
so it can't be tampered into an open redirect and doubles as CSRF
protection for the OAuth round-trip. If `return_to` was provided, the
callback redirects there (with `?authenticated=true&login=<username>`)
instead of returning a bare JSON confirmation.



```text
src/
+-- index.ts           # Route tree assembly
+-- routes/
|   +-- auth.ts        # GitHub OAuth login/callback
|   +-- posts.ts       # Post CRUD
|   +-- stories.ts     # Story CRUD
|   +-- media.ts       # Media upload
|   +-- feed.ts        # Public feed.json
|   \-- webhook.ts     # GitHub webhook (signature-verified)
+-- middleware/
|   +-- auth.ts        # Session verification + installation token
|   +-- cors.ts        # CORS for the credentialed dashboard client
|   \-- rateLimit.ts   # Per-IP fixed-window rate limiting
+-- lib/
|   +-- githubApp.ts     # App JWT signing, installation tokens
|   +-- github.ts         # Contents API (read/write/delete/list)
|   +-- session.ts         # Signed session cookies
|   +-- oauthState.ts       # Signed OAuth state (return_to + CSRF nonce)
|   +-- allowedOrigins.ts    # ALLOWED_ORIGINS parsing
|   +-- crypto.ts             # Shared base64url / HMAC helpers
|   +-- feedCache.ts           # Edge cache for feed.json
|   \-- validation.ts           # Post/story payload validation
\-- types/             # Env bindings and content types
```

## How a write reaches GitHub

1. An author authenticates via `GET /auth/github` (optionally with `?return_to=`) → GitHub OAuth → `GET /auth/github/callback`, which verifies collaborator access on the content repository, issues a signed session cookie, and redirects back to `return_to` if one was given.
2. A request to `/api/posts` (or `/stories`, `/media`) is authenticated by `middleware/auth.ts`, which resolves a fresh installation access token for the App's installation on the content repository.
3. The route handler validates the payload (`lib/validation.ts`) and calls `lib/github.ts`, which performs a Contents API `PUT`/`DELETE`, creating a real Git commit in the content repository.
4. GitHub Actions in the content repository validates the change and regenerates `feed.json`.
5. A `push` webhook notifies this Worker (`routes/webhook.ts`), which purges the edge-cached feed so the next client request fetches the updated `feed.json`.

## How the feed is served

`GET /feed.json` is served from the Cloudflare Cache API. On a cache miss it reads `feed.json` from the content repository via an installation token and re-populates the cache. Client request volume does not translate 1:1 into GitHub API calls.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in local secrets
npm run dev
```

## Deployment

Configuration lives in [`wrangler.toml`](wrangler.toml). Required secrets (set with `wrangler secret put <NAME>`, or as GitHub Actions repository secrets for CI/CD):

| Secret | Purpose |
| --- | --- |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM) |
| `GITHUB_APP_CLIENT_ID` | GitHub App OAuth client ID |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App OAuth client secret |
| `GITHUB_WEBHOOK_SECRET` | GitHub App webhook secret |
| `SESSION_SECRET` | HMAC secret for signing session cookies and OAuth state |

Plus one non-secret variable in [`wrangler.toml`](wrangler.toml)'s `[vars]`:

| Variable | Purpose |
| --- | --- |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to make credentialed cross-origin requests (e.g. the dashboard's deployed URL) |

The GitHub App itself needs:

- **Repository permissions:** `Contents: Read & write`
- **Webhook events:** `push` (scoped to the content repository)
- **Installed on:** the `moment-of-honor-content` repository only

```bash
npm run typecheck
npm test
npm run deploy
```

CI (`.github/workflows/ci.yml`) runs typecheck and tests on every pull request. `.github/workflows/deploy.yml` deploys to Cloudflare Workers on every push to `main`.

## Security notes

- The client never receives a GitHub credential of any kind.
- Author OAuth tokens are used once, to check repository access, and are never stored.
- Installation access tokens are cached in KV only for their GitHub-issued lifetime and are never exposed outside this Worker.
- Webhook requests are rejected unless their `X-Hub-Signature-256` verifies against `GITHUB_WEBHOOK_SECRET`.
- `/api/*` is rate limited per source IP; `/feed.json` relies on edge caching rather than per-request GitHub calls.

## Reliability

"Хвилина мовчання" caches the last successfully fetched feed locally and falls back to it if `/feed.json` is unreachable. The core minute-of-silence functionality of the desktop application never depends on this service being available.

## Contributing

Contributions are welcome and appreciated! Here's how you can contribute:

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please make sure to update tests as appropriate and adhere to the existing coding style.

## License

This project is licensed under the CSSM Unlimited License v2.0 (CSSM-ULv2). See the [LICENSE](LICENSE) file for details.
