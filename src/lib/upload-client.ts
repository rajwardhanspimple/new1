"use client";

export type UploadStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "failed"
  | "skipped";

export interface StagedFile {
  /** Stable key for React lists and progress updates. */
  id: string;
  file: File;
  /** Path relative to the drop root, folders included. */
  relativePath: string;
  size: number;
}

export interface FileProgress {
  status: UploadStatus;
  sha?: string;
  error?: string;
}

export interface UploadTarget {
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  /** Optional folder prefix applied to every uploaded path. */
  destination: string;
  message: string;
}

export interface CommitResult {
  commitSha: string;
  commitUrl: string;
  fileCount: number;
  branch: string;
  branchCreated: boolean;
}

export interface UploadOutcome {
  commit: CommitResult | null;
  uploaded: number;
  failed: number;
  skipped: number;
}

const CONCURRENCY = 6;
const BLOB_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips leading and trailing slashes and collapses repeated separators. */
export function normalizeSegment(value: string): string {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}

/** Final repository path for a staged file, including the destination prefix. */
export function targetPath(destination: string, relativePath: string): string {
  const prefix = normalizeSegment(destination);
  const path = normalizeSegment(relativePath);
  return prefix ? `${prefix}/${path}` : path;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function uploadBlob(
  staged: StagedFile,
  target: UploadTarget,
  signal: AbortSignal,
): Promise<string> {
  const url = `/api/upload/blob?owner=${encodeURIComponent(
    target.owner,
  )}&repo=${encodeURIComponent(target.repo)}`;
  let lastMessage = "Upload failed.";

  for (let attempt = 0; attempt <= BLOB_RETRIES; attempt += 1) {
    if (signal.aborted) throw new Error("Upload cancelled.");

    const response = await fetch(url, {
      method: "POST",
      body: staged.file,
      headers: { "content-type": "application/octet-stream" },
      signal,
    });

    if (response.ok) {
      const payload = (await response.json()) as { sha: string };
      return payload.sha;
    }

    lastMessage = await readError(response);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === BLOB_RETRIES) break;
    await sleep(600 * 2 ** attempt);
  }

  throw new Error(lastMessage);
}

/**
 * Uploads every staged file as a blob with bounded concurrency, then requests a
 * single commit containing all of the blobs that succeeded.
 */
export async function runUpload(options: {
  files: StagedFile[];
  target: UploadTarget;
  signal: AbortSignal;
  onProgress: (id: string, progress: FileProgress) => void;
}): Promise<UploadOutcome> {
  const { files, target, signal, onProgress } = options;
  const committable: Array<{ path: string; sha: string }> = [];
  let uploaded = 0;
  let failed = 0;

  const queue = [...files];
  async function worker(): Promise<void> {
    for (;;) {
      const staged = queue.shift();
      if (!staged) return;
      if (signal.aborted) {
        onProgress(staged.id, { status: "skipped", error: "Cancelled." });
        continue;
      }

      onProgress(staged.id, { status: "uploading" });
      try {
        const sha = await uploadBlob(staged, target, signal);
        committable.push({
          path: targetPath(target.destination, staged.relativePath),
          sha,
        });
        uploaded += 1;
        onProgress(staged.id, { status: "uploaded", sha });
      } catch (error) {
        failed += 1;
        onProgress(staged.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed.",
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(files.length, 1)) }, worker),
  );

  if (committable.length === 0 || signal.aborted) {
    return { commit: null, uploaded, failed, skipped: queue.length };
  }

  const response = await fetch("/api/upload/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      owner: target.owner,
      repo: target.repo,
      branch: target.branch,
      baseBranch: target.baseBranch,
      message: target.message,
      files: committable,
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return {
    commit: (await response.json()) as CommitResult,
    uploaded,
    failed,
    skipped: 0,
  };
}
