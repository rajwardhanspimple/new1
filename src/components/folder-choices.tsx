"use client";

import type { FolderMode } from "@/lib/upload-client";

interface FolderChoicesProps {
  /** Top-level folders found among the staged files, in the order added. */
  roots: string[];
  modes: Record<string, FolderMode>;
  /** Number of staged files per folder, keyed by folder name. */
  counts: Record<string, number>;
  /** Destination folder, shown in the path previews. */
  destination: string;
  disabled: boolean;
  onChange: (folder: string, mode: FolderMode) => void;
  onApplyAll: (mode: FolderMode) => void;
}

function preview(destination: string, segments: string[]): string {
  const parts = [destination.trim().replace(/^\/+|\/+$/g, ""), ...segments].filter(Boolean);
  return `/${parts.join("/")}`;
}

/**
 * Asks, for every folder the user selected, whether to recreate that folder in
 * the repository or upload only what is inside it. Nothing can be uploaded
 * until each folder has an answer.
 */
export function FolderChoices({
  roots,
  modes,
  counts,
  destination,
  disabled,
  onChange,
  onApplyAll,
}: FolderChoicesProps) {
  if (roots.length === 0) return null;

  const undecided = roots.filter((root) => !modes[root]);

  return (
    <section
      className={`panel ${
        undecided.length > 0 ? "border-amber-800/70 bg-amber-950/20" : ""
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {undecided.length > 0
              ? `How should ${
                  undecided.length === 1 ? "this folder" : "these folders"
                } be uploaded?"`.replace('"', "")
              : "Folder handling"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Pick whether each selected folder is recreated in the repository, or whether
            only its contents go in.
          </p>
        </div>

        {roots.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => onApplyAll("directory")}
              disabled={disabled}
            >
              Keep every folder
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => onApplyAll("contents")}
              disabled={disabled}
            >
              Contents only, for all
            </button>
          </div>
        ) : null}
      </header>

      <ul className="mt-4 space-y-3">
        {roots.map((root) => {
          const mode = modes[root];
          const count = counts[root] ?? 0;
          return (
            <li
              key={root}
              className={`rounded-lg border px-3 py-3 ${
                mode ? "border-slate-800 bg-slate-950/60" : "border-amber-800/70 bg-amber-950/20"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm text-slate-100">{root}/</p>
                <p className="text-xs text-slate-500">
                  {count} file{count === 1 ? "" : "s"}
                  {mode ? "" : " - waiting for your choice"}
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onChange(root, "directory")}
                  disabled={disabled}
                  className={`rounded-lg border px-3 py-2 text-left transition disabled:opacity-50 ${
                    mode === "directory"
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-slate-700 hover:border-slate-500"
                  }`}
                >
                  <span className="block text-sm font-medium text-slate-100">
                    Create the folder in the repo
                  </span>
                  <span className="mt-1 block font-mono text-xs text-slate-400">
                    {preview(destination, [root, "..."])}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onChange(root, "contents")}
                  disabled={disabled}
                  className={`rounded-lg border px-3 py-2 text-left transition disabled:opacity-50 ${
                    mode === "contents"
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-slate-700 hover:border-slate-500"
                  }`}
                >
                  <span className="block text-sm font-medium text-slate-100">
                    Use the contents only
                  </span>
                  <span className="mt-1 block font-mono text-xs text-slate-400">
                    {preview(destination, ["..."])}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-slate-500">
        Sub-folders inside a selection always keep their structure. You can change any
        answer before uploading.
      </p>
    </section>
  );
}
