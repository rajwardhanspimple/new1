import { GitHubApiError } from "@/lib/github";
import { readSession, type Session } from "@/lib/session";

/** Statuses that describe the caller's request and are passed through as-is. */
const CLIENT_STATUSES = new Set([400, 401, 403, 404, 409, 413, 422, 429]);

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Returns the session, or a 401 response when the caller is not signed in. */
export function requireSession():
  | { session: Session; response?: undefined }
  | { session?: undefined; response: Response } {
  const session = readSession();
  if (!session) {
    return { response: jsonError("Sign in with GitHub to continue.", 401) };
  }
  return { session };
}

/**
 * Adds the missing next step to GitHub messages that state a problem without
 * saying how to fix it.
 */
export function explainGitHubMessage(status: number, message: string): string {
  if (status !== 403) return message;

  if (/not accessible by personal access token/i.test(message)) {
    return `${message}. Your fine-grained token does not grant write access to this repository. Give it "Contents: Read and write" for this repository, or use a classic token with the "repo" scope.`;
  }
  if (/not accessible by integration/i.test(message)) {
    return `${message}. The GitHub App or OAuth app is not installed on this repository, or lacks contents write permission.`;
  }
  if (/must be verified/i.test(message)) {
    return `${message}. Verify your GitHub email address before pushing commits.`;
  }
  return message;
}

/** Maps thrown errors onto a JSON response that keeps GitHub's own status. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof GitHubApiError) {
    const status = CLIENT_STATUSES.has(error.status) ? error.status : 502;
    return jsonError(explainGitHubMessage(error.status, error.message), status);
  }
  if (error instanceof Error) {
    return jsonError(error.message, 500);
  }
  return jsonError("Unexpected server error.", 500);
}
