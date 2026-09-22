import { requireSession } from "@/lib/api";
import { GitHubApiError, githubRequest } from "@/lib/github";
import type { AccessResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RepoPayload {
  permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
}

/**
 * Checks whether the session token may actually write to this repository, so a
 * permission problem is reported once up front rather than once per file.
 *
 * The probe creates an empty blob. A blob that no tree references is
 * unreachable and gets collected by GitHub, so nothing appears in the
 * repository, but it exercises the exact permission the upload needs.
 */
export async function GET(
  _request: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  const { session, response } = requireSession();
  if (!session) return response;

  const owner = decodeURIComponent(params.owner);
  const repo = decodeURIComponent(params.repo);

  try {
    const repository = await githubRequest<RepoPayload>(`/repos/${owner}/${repo}`, {
      token: session.token,
      retries: 1,
    });

    if (repository.permissions && !repository.permissions.push) {
      return Response.json({
        canWrite: false,
        reason: "Your account has read-only access to this repository.",
        hint: "Ask for write access, or fork the repository and upload to your fork.",
      } satisfies AccessResponse);
    }

    await githubRequest<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      token: session.token,
      method: "POST",
      body: { content: "", encoding: "utf-8" },
      retries: 1,
    });

    return Response.json({
      canWrite: true,
      reason: null,
      hint: null,
    } satisfies AccessResponse);
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 403 || error.status === 404)) {
      const fineGrained = /not accessible by personal access token/i.test(error.message);
      return Response.json({
        canWrite: false,
        reason: error.message,
        hint: fineGrained
          ? 'Give the token "Contents: Read and write" on this repository, or use a classic token with the "repo" scope.'
          : "Check that the token covers this repository and allows writing to contents.",
      } satisfies AccessResponse);
    }

    // A transient failure must not block an upload that would otherwise work.
    return Response.json({
      canWrite: true,
      reason: null,
      hint: null,
    } satisfies AccessResponse);
  }
}
