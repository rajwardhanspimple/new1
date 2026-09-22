"use client";

import { useRef, useState } from "react";
import { stageDataTransfer, stageFiles } from "@/lib/file-staging";
import type { StagedFile } from "@/lib/upload-client";

interface FileDropzoneProps {
  disabled: boolean;
  onAdd: (files: StagedFile[]) => void;
}

export function FileDropzone({ disabled, onAdd }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    setReading(true);
    try {
      onAdd(await stageDataTransfer(event.dataTransfer));
    } finally {
      setReading(false);
    }
  }

  function handlePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files;
    if (picked) onAdd(stageFiles(Array.from(picked)));
    event.target.value = "";
  }

  return (
    <section
      className={`panel border-dashed transition ${
        dragging ? "border-sky-500 bg-sky-500/5" : ""
      } ${disabled ? "opacity-60" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-base font-medium text-slate-200">
          {reading ? "Reading dropped folders..." : "Drop files or folders here"}
        </p>
        <p className="max-w-md text-sm text-slate-400">
          Nested folder structure is preserved. Everything you add is pushed as a single
          commit.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInput.current?.click()}
            disabled={disabled}
          >
            Choose files
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => folderInput.current?.click()}
            disabled={disabled}
          >
            Choose a folder
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        className="hidden"
        type="file"
        multiple
        onChange={handlePicked}
      />
      <input
        ref={folderInput}
        className="hidden"
        type="file"
        multiple
        // @ts-expect-error non-standard attributes enable directory selection
        webkitdirectory=""
        directory=""
        onChange={handlePicked}
      />
    </section>
  );
}
