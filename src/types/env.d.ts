export interface Env {
  CACHE: KVNamespace;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  SESSION_SECRET: string;

  CONTENT_REPO_OWNER: string;
  CONTENT_REPO_NAME: string;
  CONTENT_REPO_BRANCH: string;

  /** Comma-separated list of origins allowed to make credentialed cross-origin requests. */
  ALLOWED_ORIGINS: string;
}
