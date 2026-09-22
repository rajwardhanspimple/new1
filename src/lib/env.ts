const FALLBACK_MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Largest accepted size for a single uploaded file, in bytes. */
export function maxFileBytes(): number {
  const configured = Number(process.env.MAX_FILE_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : FALLBACK_MAX_FILE_BYTES;
}

/** True when OAuth credentials are present, so the OAuth button is usable. */
export function isOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

/**
 * Public base URL of this deployment. Prefers APP_URL, falls back to the
 * Vercel-provided host, and finally to the incoming request origin.
 */
export function appUrl(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return new URL(request.url).origin;
}

/** OAuth scopes needed to list repositories and push commits. */
export const OAUTH_SCOPES = "repo read:org";
