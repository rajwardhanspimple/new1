"use client";

import { useEffect, useMemo, useState } from "react";
import type { RepoSummary } from "@/app/api/repos/route";
import type { BranchSummary } from "@/app/api/repos/[owner]/[repo]/branches/route";

export interface Destination {
  repo: RepoSummary;
  branch: string;
  /** Set when the branch does not exist yet and must be created from here. */
  baseBranch?: string;
  folder: string;
}

interface DestinationPickerProps {
  onChange: (destination: Destination | null) => void;
  onError: (message: string | null) => void;
}

export function DestinationPicker({ onChange, onError }: DestinationPickerProps) {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFullName, setSelectedFullName] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branch, setBranch] = useState("");
  const [newBranchMode, setNewBranchMode] = useState(false);
  const [folder, setFolder] = useState("");

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.fullName === selectedFullName) ?? null,
    [repos, selectedFullName],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/repos");
        const payload = (await response.json()) as {
          repositories?: RepoSummary[];
          error?: string;
        };
        if (!response.ok || !payload.repositories) {
          throw new Error(payload.error ?? "Could not list your repositories.");
        }
        if (!cancelled) setRepos(payload.repositories);
      } catch (cause) {
        if (!cancelled) {
          onError(cause instanceof Error ? cause.message : "Could not list repositories.");
        }
      } finally {
        if (!cancelled) setLoadingRepos(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setBranch("");
      return;
    }

    let cancelled = false;
    setLoadingBranches(true);
    setNewBranchMode(false);

    async function load(repoOwner: string, repoName: string, fallbackBranch: string) {
      try {
        const response = await fetch(
          `/api/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(
            repoName,
          )}/branches`,
        );
        const payload = (await response.json()) as {
          branches?: BranchSummary[];
          error?: string;
        };
        if (!response.ok || !payload.branches) {
          throw new Error(payload.error ?? "Could not list branches.");
        }
        if (cancelled) return;
        setBranches(payload.branches);
        setBranch(payload.branches[0]?.name ?? fallbackBranch);
      } catch (cause) {
        if (!cancelled) {
          onError(cause instanceof Error ? cause.message : "Could not list branches.");
        }
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    }

    void load(selectedRepo.owner, selectedRepo.name, selectedRepo.defaultBranch);
    return () => {
      cancelled = true;
    };
  }, [selectedRepo, onError]);

  useEffect(() => {
    if (!selectedRepo || !branch.trim()) {
      onChange(null);
      return;
    }
    onChange({
      repo: selectedRepo,
      branch: branch.trim(),
      baseBranch: newBranchMode ? selectedRepo.defaultBranch : undefined,
      folder,
    });
  }, [selectedRepo, branch, newBranchMode, folder, onChange]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return repos.slice(0, 60);
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(term)).slice(0, 60);
  }, [repos, search]);

  const activeBranch = branches.find((entry) => entry.name === branch);

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-100">Choose a destination</h2>
      <p className="mt-1 text-sm text-slate-400">
        Only repositories you can push to are listed.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="repo-search">
            Repository
          </label>
          <input
            id="repo-search"
            className="field"
            placeholder={loadingRepos ? "Loading repositories..." : "Filter by name"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={loadingRepos}
          />
          <select
            className="field mt-2"
            size={6}
            value={selectedFullName ?? ""}
            onChange={(event) => setSelectedFullName(event.target.value || null)}
            disabled={loadingRepos}
          >
            {filtered.map((repo) => (
              <option key={repo.fullName} value={repo.fullName}>
                {repo.fullName}
                {repo.isPrivate ? " (private)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            {loadingRepos
              ? "Fetching your repositories from GitHub."
              : `${repos.length} repositories available.`}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="branch">
                Branch
              </label>
              <button
                type="button"
                className="btn-ghost !px-0 !py-0 text-xs"
                onClick={() => {
                  setNewBranchMode((on) => !on);
                  setBranch(newBranchMode ? (branches[0]?.name ?? "") : "");
                }}
                disabled={!selectedRepo}
              >
                {newBranchMode ? "Pick an existing branch" : "Create a new branch"}
              </button>
            </div>

            {newBranchMode ? (
              <input
                id="branch"
                className="field"
                placeholder="upload/batch-1"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={!selectedRepo}
              />
            ) : (
              <select
                id="branch"
                className="field"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={!selectedRepo || loadingBranches}
              >
                {branches.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                    {entry.isDefault ? " (default)" : ""}
                    {entry.isProtected ? " - protected" : ""}
                  </option>
                ))}
              </select>
            )}

            {newBranchMode && selectedRepo ? (
              <p className="mt-1.5 text-xs text-slate-500">
                Branched from {selectedRepo.defaultBranch}.
              </p>
            ) : null}

            {activeBranch?.isProtected ? (
              <p className="mt-1.5 text-xs text-amber-300">
                This branch is protected. A direct push may be rejected; upload to a new
                branch instead.
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="folder">
              Destination folder (optional)
            </label>
            <input
              id="folder"
              className="field font-mono"
              placeholder="assets/2026"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              disabled={!selectedRepo}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Prefixed to every uploaded path. Leave blank to upload into the repository
              root.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
