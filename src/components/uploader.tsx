"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DestinationPicker, type Destination } from "@/components/destination-picker";
import { FileDropzone } from "@/components/file-dropzone";
import { FileList } from "@/components/file-list";
import { SignInPanel } from "@/components/sign-in-panel";
import { dedupeByPath } from "@/lib/file-staging";
import type { PathsResponse } from "@/lib/types";
import type { SessionView } from "@/lib/session";
import {
  runUpload,
  targetPath,
  type CommitResult,
  type FileProgress,
  type StagedFile,
} from "@/lib/upload-client";

interface SessionResponse {
  session: SessionView | null;
  oauthAvailable: boolean;
  maxFileBytes: number;
}

export function Uploader({ initialError }: { initialError?: string }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionView | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [maxFileBytes, setMaxFileBytes] = useState(4 * 1024 * 1024);

  const [destination, setDestination] = useState<Destination | null>(null);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [progress, setProgress] = useState<Record<string, FileProgress>>({});
  const [existingPaths, setExistingPaths] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/session");
        const payload = (await response.json()) as SessionResponse;
        setSession(payload.session);
        setOauthAvailable(payload.oauthAvailable);
        setMaxFileBytes(payload.maxFileBytes);
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const owner = destination?.repo.owner ?? null;
  const repoName = destination?.repo.name ?? null;
  const branchName = destination?.branch ?? null;
  const isNewBranch = Boolean(destination?.baseBranch);

  useEffect(() => {
    if (!owner || !repoName || !branchName || isNewBranch) {
      setExistingPaths(new Set());
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(
          `/api/repos/${encodeURIComponent(owner as string)}/${encodeURIComponent(
            repoName as string,
          )}/paths?branch=${encodeURIComponent(branchName as string)}`,
        );
        if (!response.ok) return;
        const payload = (await response.json()) as PathsResponse;
        if (!cancelled) setExistingPaths(new Set(payload.paths));
      } catch {
        // Collision hints are advisory, so lookup failures are ignored.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [owner, repoName, branchName, isNewBranch]);

  const oversizedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const file of files) {
      if (file.size > maxFileBytes) ids.add(file.id);
    }
    return ids;
  }, [files, maxFileBytes]);

  const uploadable = useMemo(
    () => files.filter((file) => !oversizedIds.has(file.id)),
    [files, oversizedIds],
  );

  const addFiles = useCallback((incoming: StagedFile[]) => {
    setResult(null);
    setFiles((current) => dedupeByPath([...current, ...incoming]));
  }, []);

  const handleDestination = useCallback((next: Destination | null) => {
    setDestination(next);
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    setSession(null);
    setFiles([]);
    setProgress({});
    setDestination(null);
    setResult(null);
  }

  async function startUpload() {
    if (!destination || uploadable.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(
      Object.fromEntries(
        uploadable.map((file) => [file.id, { status: "pending" } as FileProgress]),
      ),
    );

    try {
      const outcome = await runUpload({
        files: uploadable,
        target: {
          owner: destination.repo.owner,
          repo: destination.repo.name,
          branch: destination.branch,
          baseBranch: destination.baseBranch,
          destination: destination.folder,
          message:
            message.trim() ||
            `Upload ${uploadable.length} file${uploadable.length === 1 ? "" : "s"}`,
        },
        signal: controller.signal,
        onProgress: (id, update) =>
          setProgress((current) => ({ ...current, [id]: update })),
      });

      if (outcome.commit) {
        setResult(outcome.commit);
        setExistingPaths((current) => {
          const next = new Set(current);
          for (const file of uploadable) {
            next.add(targetPath(destination.folder, file.relativePath));
          }
          return next;
        });
      }
      if (outcome.failed > 0) {
        setError(
          `${outcome.failed} file${outcome.failed === 1 ? "" : "s"} could not be uploaded${
            outcome.commit ? " and were left out of the commit" : ""
          }.`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Uploader for GitHub</h1>
          <p className="mt-1 text-sm text-slate-400">
            Push many files, or whole folders, into any repository you can write to, as one
            commit.
          </p>
        </div>
        {session ? (
          <div className="flex items-center gap-3">
            {session.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full border border-slate-700"
              />
            ) : null}
            <div className="text-right text-xs">
              <p className="font-medium text-slate-200">{session.name ?? session.login}</p>
              <p className="text-slate-500">@{session.login}</p>
            </div>
            <button type="button" className="btn-secondary" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {!session ? (
        <SignInPanel oauthAvailable={oauthAvailable} onSignedIn={setSession} />
      ) : (
        <>
          <DestinationPicker onChange={handleDestination} onError={setError} />
          <FileDropzone disabled={busy} onAdd={addFiles} />
          <FileList
            files={files}
            progress={progress}
            destinationFolder={destination?.folder ?? ""}
            existingPaths={existingPaths}
            oversizedIds={oversizedIds}
            maxFileBytes={maxFileBytes}
            busy={busy}
            onRemove={(id) =>
              setFiles((current) => current.filter((file) => file.id !== id))
            }
            onClear={() => {
              setFiles([]);
              setProgress({});
            }}
          />

          <section className="panel">
            <label className="label" htmlFor="commit-message">
              Commit message
            </label>
            <input
              id="commit-message"
              className="field"
              placeholder={`Upload ${uploadable.length || "N"} files`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={busy}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-primary"
                onClick={startUpload}
                disabled={busy || !destination || uploadable.length === 0}
              >
                {busy
                  ? "Uploading..."
                  : `Upload ${uploadable.length} file${
                      uploadable.length === 1 ? "" : "s"
                    }`}
              </button>
              {busy ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => abortRef.current?.abort()}
                >
                  Cancel
                </button>
              ) : null}
              {destination ? (
                <p className="text-xs text-slate-500">
                  Target: {destination.repo.fullName} @ {destination.branch}
                  {destination.baseBranch ? " (new branch)" : ""}
                  {destination.folder ? ` in /${destination.folder}` : ""}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Pick a repository and branch first.</p>
              )}
            </div>

            {result ? (
              <p className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                Committed {result.fileCount} file{result.fileCount === 1 ? "" : "s"} to{" "}
                {result.branch}
                {result.branchCreated ? " (branch created)" : ""}.{" "}
                <a
                  className="underline decoration-emerald-500/60 hover:decoration-emerald-300"
                  href={result.commitUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View commit {result.commitSha.slice(0, 7)}
                </a>
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
