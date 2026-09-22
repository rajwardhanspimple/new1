import { requireSession, toErrorResponse } from "@/lib/api";
import { githubRequest } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TreeResponse {
  tree: Array<{ path: string; type: string }>;
  truncated: boolean;
}

/**
 * Returns every file path on a branch so the client can warn about overwrites.
 * A very large repository may truncate; the flag lets the UI say so.
 */
export async function GET(
  request: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  const { session, response } = requireSession();
  if (!session) return response;

  const owner = decodeURIComponent(params.owner);
  const repo = decodeURIComponent(params.repo);
  const branch = new URL(request.url).searchParams.get("branch");
  if (!branch) {
    return Response.json({ error: "A branch query parameter is required." }, { status: 400 });
  }

  try {
    const tree = await githubRequest<TreeResponse | null>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { token: session.token, nullOn: [404, 409] },
    );

    if (!tree) {
      return Response.json({ paths: [], truncated: false });
    }

    return Response.json({
      paths: tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path),
      truncated: tree.truncated,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
