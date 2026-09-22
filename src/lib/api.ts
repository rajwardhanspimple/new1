import { GitHubApiError } from "@/lib/github";
import { readSession, type Session } from "@/lib/session";

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

/** Maps thrown errors onto a JSON response with a useful status code. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof GitHubApiError) {
    const status = error.status === 401 ? 401 : error.status === 404 ? 404 : 502;
    return jsonError(error.message, status);
  }
  if (error instanceof Error) {
    return jsonError(error.message, 500);
  }
  return jsonError("Unexpected server error.", 500);
}
