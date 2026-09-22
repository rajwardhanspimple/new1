import { requireSession, toErrorResponse } from "@/lib/api";
import { githubPaginate, githubRequest } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BranchPayload {
  name: string;
  protected: boolean;
}

interface RepoPayload {
  default_branch: string;
}

export interface BranchSummary {
  name: string;
  isProtected: boolean;
  isDefault: boolean;
}

/** Lists the branches of one repository, marking the default and protected ones. */
export async function GET(
  _request: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  const { session, response } = requireSession();
  if (!session) return response;

  const owner = decodeURIComponent(params.owner);
  const repo = decodeURIComponent(params.repo);

  try {
    const [repository, branches] = await Promise.all([
      githubRequest<RepoPayload>(`/repos/${owner}/${repo}`, { token: session.token }),
      githubPaginate<BranchPayload>(`/repos/${owner}/${repo}/branches?per_page=100`, {
        token: session.token,
        maxPages: 5,
      }),
    ]);

    const summaries: BranchSummary[] = branches.map((branch) => ({
      name: branch.name,
      isProtected: branch.protected,
      isDefault: branch.name === repository.default_branch,
    }));
    summaries.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({
      branches: summaries,
      defaultBranch: repository.default_branch,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
