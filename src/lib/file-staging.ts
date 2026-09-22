"use client";

import type { StagedFile } from "@/lib/upload-client";
import { normalizeSegment } from "@/lib/upload-client";

let counter = 0;

function nextId(): string {
  counter += 1;
  return `f${counter}`;
}

/** Path GitHub cannot store, or noise we never want to upload. */
const IGNORED = [/(^|\/)\.git\//, /(^|\/)\.DS_Store$/, /(^|\/)node_modules\//, /(^|\/)Thumbs\.db$/];

function isIgnored(path: string): boolean {
  return IGNORED.some((pattern) => pattern.test(path));
}

function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  const candidate = withPath.webkitRelativePath || file.name;
  return normalizeSegment(candidate);
}

export function stageFiles(files: Iterable<File>): StagedFile[] {
  const staged: StagedFile[] = [];
  for (const file of files) {
    const relativePath = relativePathOf(file);
    if (!relativePath || isIgnored(relativePath)) continue;
    staged.push({ id: nextId(), file, relativePath, size: file.size });
  }
  return staged;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file: (onSuccess: (file: File) => void, onError: (error: unknown) => void) => void;
  createReader: () => {
    readEntries: (
      onSuccess: (entries: FileSystemEntryLike[]) => void,
      onError: (error: unknown) => void,
    ) => void;
  };
}

function readEntryFile(entry: FileSystemEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function readDirectory(entry: FileSystemEntryLike): Promise<FileSystemEntryLike[]> {
  const reader = entry.createReader();
  const collected: FileSystemEntryLike[] = [];

  return new Promise((resolve) => {
    function readBatch() {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(collected);
            return;
          }
          collected.push(...entries);
          readBatch();
        },
        () => resolve(collected),
      );
    }
    readBatch();
  });
}

async function walkEntry(entry: FileSystemEntryLike, staged: StagedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    if (!file) return;
    const relativePath = normalizeSegment(entry.fullPath || file.name);
    if (!relativePath || isIgnored(relativePath)) return;
    staged.push({ id: nextId(), file, relativePath, size: file.size });
    return;
  }

  if (entry.isDirectory) {
    const entries = await readDirectory(entry);
    for (const child of entries) {
      await walkEntry(child, staged);
    }
  }
}

/**
 * Expands a drop into staged files. Directories are walked recursively so a
 * dropped folder keeps its nested structure.
 */
export async function stageDataTransfer(transfer: DataTransfer): Promise<StagedFile[]> {
  const items = Array.from(transfer.items).filter((item) => item.kind === "file");
  const entries = items
    .map((item) => {
      const withEntry = item as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntryLike | null;
      };
      return withEntry.webkitGetAsEntry?.() ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => entry !== null);

  if (entries.length === 0) {
    return stageFiles(Array.from(transfer.files));
  }

  const staged: StagedFile[] = [];
  for (const entry of entries) {
    await walkEntry(entry, staged);
  }
  return staged;
}

/** Removes entries whose final repository path repeats an earlier one. */
export function dedupeByPath(files: StagedFile[]): StagedFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.relativePath)) return false;
    seen.add(file.relativePath);
    return true;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
