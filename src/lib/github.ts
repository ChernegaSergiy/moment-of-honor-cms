// Thin wrapper over the GitHub Contents API used to read, create, update
// and delete files in the content repository on behalf of the App
// installation.

import type { Env } from '../types/env';

const API_BASE = 'https://api.github.com';

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'moment-of-honor-cms',
  };
}

function repoPath(env: Env, path: string) {
  return `${API_BASE}/repos/${env.CONTENT_REPO_OWNER}/${env.CONTENT_REPO_NAME}/contents/${path}`;
}

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface ContentsGetResponse {
  sha: string;
  content: string;
  encoding: 'base64';
}

function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Reads and base64-decodes a file. Returns null if it does not exist. */
export async function readFile(
  env: Env,
  token: string,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  const response = await fetch(`${repoPath(env, path)}?ref=${env.CONTENT_REPO_BRANCH}`, {
    headers: headers(token),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GitHubApiError(response.status, await response.text());
  }

  const data = (await response.json()) as ContentsGetResponse;
  return { content: decodeBase64(data.content), sha: data.sha };
}

/** Creates a file, or updates it if `sha` (of the current version) is provided. */
export async function writeFile(
  env: Env,
  token: string,
  path: string,
  content: string,
  message: string,
  authorName: string,
  authorEmail: string,
  sha?: string,
  encode = true,
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: encode ? encodeBase64(content) : content,
    branch: env.CONTENT_REPO_BRANCH,
    committer: { name: authorName, email: authorEmail },
  };
  if (sha) body.sha = sha;

  const response = await fetch(repoPath(env, path), {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new GitHubApiError(response.status, await response.text());
  }
}

export async function deleteFile(
  env: Env,
  token: string,
  path: string,
  message: string,
  authorName: string,
  authorEmail: string,
  sha: string,
): Promise<void> {
  const response = await fetch(repoPath(env, path), {
    method: 'DELETE',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sha,
      branch: env.CONTENT_REPO_BRANCH,
      committer: { name: authorName, email: authorEmail },
    }),
  });

  if (!response.ok) {
    throw new GitHubApiError(response.status, await response.text());
  }
}

interface ContentsListEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
}

/** Lists entries in a directory. Returns an empty array if it does not exist. */
export async function listDirectory(env: Env, token: string, path: string): Promise<ContentsListEntry[]> {
  const response = await fetch(`${repoPath(env, path)}?ref=${env.CONTENT_REPO_BRANCH}`, {
    headers: headers(token),
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    throw new GitHubApiError(response.status, await response.text());
  }

  return (await response.json()) as ContentsListEntry[];
}
