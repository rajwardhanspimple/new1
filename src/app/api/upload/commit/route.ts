import { jsonError, requireSession, toErrorResponse } from "@/lib/api";
import { githubRequest } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Tree entries are chunked so a huge batch does not exceed the API's limits. */
const TREE_CHUNK_SIZE = 400;
const FILE_MODE = "100644";

interface CommitRequestBody {
  owner?: string;
  repo?: string;
  branch?: string;
  baseBranch?: string;
  message?: string;
  files?: Array<{ path?: string; sha?: string }>;
}

interface RefResponse {
  object: { sha: string };
}

interface CommitResponse {
  sha: string;
  html_url?: string;
  tree: { sha: string };
}

interface TreeResponse {
  sha: string;
}

/**
 * Writes every uploaded blob into a single commit: build the tree, create the
 * commit, then fast-forward the branch reference.
 */
export async function POST(request: Request) {
  const { session, response } = requireSession();
  if (!session) return response;

  let body: CommitRequestBody;
  try {
    body = (await request.json()) as CommitRequestBody;
  } catch {
    return jsonError("Send a JSON body describing the commit.", 400);
  }

  const { owner, repo, branch, baseBranch, message } = body;
  if (!owner || !repo || !branch || !message) {
    return jsonError("owner, repo, branch, and message are all required.", 400);
  }

  const files = (body.files ?? []).filter(
    (file): file is { path: string; sha: string } =>
      typeof file.path === "string" && file.path.length > 0 && typeof file.sha === "string",
  );
  if (files.length === 0) {
    return jsonError("No uploaded files were supplied for the commit.", 400);
  }

  const token = session.token;
  const refPath = `/repos/${owner}/${repo}/git/refs/heads/${branch}`;

  try {
    let branchCreated = false;
    let headRef = await githubRequest<RefResponse | null>(refPath, { token, nullOn: [404] });

    if (!headRef) {
      if (!baseBranch) {
        return jsonError(
          `Branch "${branch}" does not exist. Supply baseBranch to create it.`,
          400,
        );
      }
      const baseRef = await githubRequest<RefResponse>(
        `/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`,
        { token },
      );
      headRef = await githubRequest<RefResponse>(`/repos/${owner}/${repo}/git/refs`, {
        token,
        method: "POST",
        body: { ref: `refs/heads/${branch}`, sha: baseRef.object.sha },
      });
      branchCreated = true;
    }

    const headCommitSha = headRef.object.sha;
    const headCommit = await githubRequest<CommitResponse>(
      `/repos/${owner}/${repo}/git/commits/${headCommitSha}`,
      { token },
    );

    let baseTreeSha = headCommit.tree.sha;
    for (let index = 0; index < files.length; index += TREE_CHUNK_SIZE) {
      const chunk = files.slice(index, index + TREE_CHUNK_SIZE);
      const tree = await githubRequest<TreeResponse>(`/repos/${owner}/${repo}/git/trees`, {
        token,
        method: "POST",
        body: {
          base_tree: baseTreeSha,
          tree: chunk.map((file) => ({
            path: file.path,
            mode: FILE_MODE,
            type: "blob",
            sha: file.sha,
          })),
        },
      });
      baseTreeSha = tree.sha;
    }

    const commit = await githubRequest<CommitResponse>(
      `/repos/${owner}/${repo}/git/commits`,
      {
        token,
        method: "POST",
        body: { message, tree: baseTreeSha, parents: [headCommitSha] },
      },
    );

    await githubRequest<RefResponse>(refPath, {
      token,
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });

    return Response.json({
      commitSha: commit.sha,
      commitUrl:
        commit.html_url ?? `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
      fileCount: files.length,
      branch,
      branchCreated,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
