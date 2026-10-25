"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { DragEvent, useRef, useState } from "react";

import { cn, IconButton } from "@/components/ui/Button";

/**
 * Drag-and-drop (or click) file picker for a single PDF. Shows the chosen
 * file as a preview row; the parent owns the file and the upload.
 */
export function Dropzone({
  id,
  file,
  onFile,
  disabled,
  title = "Drop your PDF here",
  hint = "PDF up to 20 MB",
}: {
  id: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  title?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const isPdf = candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
    setRejected(!isPdf);
    if (isPdf) onFile(candidate);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept(event.dataTransfer.files?.[0]);
  }

  if (file) {
    return (
      <div className="flex animate-fade-in items-center gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-danger shadow-sm">
          <FileText size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{file.name}</p>
          <p className="text-xs text-muted tabular-nums">{(file.size / 1024 / 1024).toFixed(2)} MB · PDF</p>
        </div>
        {!disabled ? (
          <IconButton
            icon={X}
            label="Remove file"
            size="sm"
            onClick={() => {
              onFile(null);
              if (input.current) input.current.value = "";
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150",
          "focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2/50 hover:border-accent-line hover:bg-accent-soft/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted shadow-sm transition-transform duration-200",
            dragging ? "scale-110 text-accent-text" : "group-hover:text-accent-text",
          )}
        >
          <UploadCloud size={20} aria-hidden />
        </span>
        <span className="mt-3 text-sm font-medium text-fg">
          {dragging ? "Release to add the file" : title}
        </span>
        <span className="mt-1 text-xs text-muted">
          or <span className="font-medium text-accent-text underline-offset-2 group-hover:underline">browse your files</span> · {hint}
        </span>
        <input
          id={id}
          ref={input}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          disabled={disabled}
          onChange={(event) => accept(event.target.files?.[0])}
        />
      </label>
      {rejected ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          Only PDF files can be uploaded.
        </p>
      ) : null}
    </div>
  );
}
