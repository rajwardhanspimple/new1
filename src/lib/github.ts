const API_ROOT = "https://api.github.com";
const USER_AGENT = "github-bulk-uploader";
const DEFAULT_RETRIES = 4;
const MAX_BACKOFF_MS = 30_000;

export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

interface GitHubRequestOptions {
  token: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  retries?: number;
  /** Treat these statuses as a null result instead of throwing. */
  nullOn?: number[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GitHub answers 403 both for rate limiting and for "your token may not do
 * this". Only the first kind is worth retrying, so the headers and message are
 * checked for a rate-limit signal before any waiting happens.
 */
function isRateLimited(response: Response, message: string): boolean {
  if (response.headers.get("retry-after")) return true;
  if (response.headers.get("x-ratelimit-remaining") === "0") return true;
  return /rate limit|secondary rate|abuse detection|try again later/i.test(message);
}

function isRetryable(status: number, response: Response, message: string): boolean {
  if (status >= 500) return true;
  if (status === 429) return true;
  if (status === 403) return isRateLimited(response, message);
  return false;
}

/** Milliseconds to wait before retrying, honouring GitHub's rate limit hints. */
function backoffMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    }
  }

  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (remaining === "0" && reset) {
    const waitMs = Number(reset) * 1000 - Date.now();
    if (Number.isFinite(waitMs) && waitMs > 0) {
      return Math.min(waitMs + 1000, MAX_BACKOFF_MS);
    }
  }

  const jitter = Math.floor(Math.random() * 400);
  return Math.min(500 * 2 ** attempt + jitter, MAX_BACKOFF_MS);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText || `GitHub returned ${response.status}`;
    const parsed = JSON.parse(text) as {
      message?: string;
      errors?: Array<{ message?: string; field?: string; code?: string }>;
    };
    const details = parsed.errors
      ?.map((entry) => entry.message ?? `${entry.field ?? ""} ${entry.code ?? ""}`.trim())
      .filter(Boolean)
      .join("; ");
    return [parsed.message, details].filter(Boolean).join(" - ") || text.slice(0, 300);
  } catch {
    return response.statusText || `GitHub returned ${response.status}`;
  }
}

/** Calls the GitHub REST API, retrying only genuinely transient failures. */
export async function githubRequest<T>(
  path: string,
  options: GitHubRequestOptions,
): Promise<T> {
  const { token, method = "GET", body, retries = DEFAULT_RETRIES, nullOn = [] } = options;
  const url = path.startsWith("http") ? path : `${API_ROOT}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": USER_AGENT,
          "x-github-api-version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error("Network request failed");
      if (attempt === retries) break;
      await sleep(Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS));
      continue;
    }

    if (nullOn.includes(response.status)) {
      return null as T;
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    const message = await errorMessage(response);

    if (attempt < retries && isRetryable(response.status, response, message)) {
      lastError = new GitHubApiError(response.status, message);
      await sleep(backoffMs(response, attempt));
      continue;
    }

    throw new GitHubApiError(response.status, message);
  }

  throw lastError ?? new GitHubApiError(500, "GitHub request failed");
}

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const section of linkHeader.split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(section.trim());
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Follows Link headers and returns every item across pages, up to maxPages. */
export async function githubPaginate<T>(
  path: string,
  options: { token: string; maxPages?: number },
): Promise<T[]> {
  const { token, maxPages = 10 } = options;
  const items: T[] = [];
  let url: string | null = path.startsWith("http") ? path : `${API_ROOT}${path}`;

  for (let page = 0; page < maxPages && url; page += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": USER_AGENT,
        "x-github-api-version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new GitHubApiError(response.status, await errorMessage(response));
    }

    const batch = (await response.json()) as T[];
    items.push(...batch);
    url = nextPageUrl(response.headers.get("link"));
  }

  return items;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export async function fetchViewer(token: string): Promise<GitHubUser> {
  return githubRequest<GitHubUser>("/user", { token, retries: 1 });
}
