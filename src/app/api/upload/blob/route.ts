import { jsonError, requireSession, toErrorResponse } from "@/lib/api";
import { maxFileBytes } from "@/lib/env";
import { githubRequest } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

interface BlobResponse {
  sha: string;
}

/**
 * Uploads one file's bytes as a git blob and returns its SHA. The client sends
 * the raw body, so nothing is base64-inflated over the wire twice.
 */
export async function POST(request: Request) {
  const { session, response } = requireSession();
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  if (!owner || !repo) {
    return jsonError("owner and repo query parameters are required.", 400);
  }

  const bytes = await request.arrayBuffer();
  const limit = maxFileBytes();
  if (bytes.byteLength > limit) {
    return jsonError(
      `File is larger than the ${Math.round(limit / 1024 / 1024)} MB per-file limit.`,
      413,
    );
  }

  try {
    const blob = await githubRequest<BlobResponse>(`/repos/${owner}/${repo}/git/blobs`, {
      token: session.token,
      method: "POST",
      body: {
        content: Buffer.from(bytes).toString("base64"),
        encoding: "base64",
      },
    });
    return Response.json({ sha: blob.sha, size: bytes.byteLength });
  } catch (error) {
    return toErrorResponse(error);
  }
}
