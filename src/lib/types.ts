/** Shapes shared between the API routes and the client. */

export interface RepoSummary {
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  pushedAt: string | null;
}

export interface BranchSummary {
  name: string;
  isProtected: boolean;
  isDefault: boolean;
}

export interface ReposResponse {
  repositories: RepoSummary[];
}

export interface BranchesResponse {
  branches: BranchSummary[];
  defaultBranch: string;
}

export interface PathsResponse {
  paths: string[];
  truncated: boolean;
}
