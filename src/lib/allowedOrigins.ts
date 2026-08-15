// Parses the ALLOWED_ORIGINS env var (comma-separated origins) shared by
// the CORS middleware and the OAuth return_to allowlist check.

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
