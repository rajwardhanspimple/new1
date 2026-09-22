"use client";

import { formatBytes } from "@/lib/file-staging";
import type { FileProgress, StagedFile } from "@/lib/upload-client";
import { targetPath } from "@/lib/upload-client";

interface FileListProps {
  files: StagedFile[];
  progress: Record<string, FileProgress>;
  destinationFolder: string;
  existingPaths: Set<string>;
  oversizedIds: Set<string>;
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
  destinationFolder,
  existingPaths,
  oversizedIds,
  maxFileBytes,
  busy,
  onRemove,
  onClear,
}: FileListProps) {
  if (files.length === 0) return null;

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const overwrites = files.filter((file) =>
    existingPaths.has(targetPath(destinationFolder, file.relativePath)),
  );

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
          const path = targetPath(destinationFolder, file.relativePath);
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
                  oversized ? STATUS_STYLES.failed : STATUS_STYLES[state]
                }`}
              >
                {oversized ? "Too large" : STATUS_LABELS[state]}
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
