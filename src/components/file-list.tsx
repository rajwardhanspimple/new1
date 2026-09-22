"use client";

import { formatBytes } from "@/lib/file-staging";
import type { FileProgress, StagedFile } from "@/lib/upload-client";

interface FileListProps {
  files: StagedFile[];
  progress: Record<string, FileProgress>;
  /** Maps a staged file onto its final repository path. */
  pathOf: (file: StagedFile) => string;
  existingPaths: Set<string>;
  oversizedIds: Set<string>;
  /** Files whose final path repeats an earlier file's path. */
  duplicateIds: Set<string>;
  maxFileBytes: number;
  busy: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "text-slate-500",
  uploading: "text-sky-300",
  uploaded: "text-emerald-300",
  failed: "text-rose-300",
  skipped: "text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  uploading: "Uploading",
  uploaded: "Uploaded",
  failed: "Failed",
  skipped: "Skipped",
};

export function FileList({
  files,
  progress,
  pathOf,
  existingPaths,
  oversizedIds,
  duplicateIds,
  maxFileBytes,
  busy,
  onRemove,
  onClear,
}: FileListProps) {
  if (files.length === 0) return null;

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const overwrites = files.filter((file) => existingPaths.has(pathOf(file)));

  return (
    <section className="panel">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {files.length} file{files.length === 1 ? "" : "s"} staged
          </h2>
          <p className="text-sm text-slate-400">{formatBytes(totalBytes)} in total</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onClear} disabled={busy}>
          Clear all
        </button>
      </header>

      {oversizedIds.size > 0 ? (
        <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          {oversizedIds.size} file{oversizedIds.size === 1 ? " is" : "s are"} above the{" "}
          {formatBytes(maxFileBytes)} per-file limit and will be skipped.
        </p>
      ) : null}

      {duplicateIds.size > 0 ? (
        <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          {duplicateIds.size} file{duplicateIds.size === 1 ? "" : "s"} would land on a path
          already used by another staged file and will be skipped. Keeping a folder instead
          of using its contents usually resolves this.
        </p>
      ) : null}

      {overwrites.length > 0 ? (
        <p className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          {overwrites.length} path{overwrites.length === 1 ? "" : "s"} already exist on this
          branch and will be overwritten by the commit.
        </p>
      ) : null}

      <ul className="mt-4 max-h-80 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
        {files.map((file) => {
          const state = progress[file.id]?.status ?? "pending";
          const oversized = oversizedIds.has(file.id);
          const duplicate = duplicateIds.has(file.id);
          const path = pathOf(file);
          const blocked = oversized || duplicate;
          return (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-slate-200">{path}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.size)}
                  {existingPaths.has(path) ? " - overwrites existing file" : ""}
                  {progress[file.id]?.error ? ` - ${progress[file.id]?.error}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs ${
                  blocked ? STATUS_STYLES.failed : STATUS_STYLES[state]
                }`}
              >
                {oversized ? "Too large" : duplicate ? "Duplicate path" : STATUS_LABELS[state]}
              </span>
              <button
                type="button"
                className="btn-ghost shrink-0 !px-1 !py-0 text-xs"
                onClick={() => onRemove(file.id)}
                disabled={busy}
                aria-label={`Remove ${path}`}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
