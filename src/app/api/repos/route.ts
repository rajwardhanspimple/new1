import { requireSession, toErrorResponse } from "@/lib/api";
import { githubPaginate } from "@/lib/github";
import type { RepoSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RepoPayload {
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  archived: boolean;
  default_branch: string;
  pushed_at: string | null;
  permissions?: { push?: boolean; admin?: boolean };
}

/** Lists every repository the signed-in user can push to, newest push first. */
export async function GET() {
  const { session, response } = requireSession();
  if (!session) return response;

  try {
    const repos = await githubPaginate<RepoPayload>(
      "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
      { token: session.token, maxPages: 10 },
    );

    const writable: RepoSummary[] = repos
      .filter((repo) => !repo.archived)
      .filter((repo) => repo.permissions?.push || repo.permissions?.admin)
      .map((repo) => ({
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch,
        pushedAt: repo.pushed_at,
      }));

    return Response.json({ repositories: writable });
  } catch (error) {
    return toErrorResponse(error);
  }
}
