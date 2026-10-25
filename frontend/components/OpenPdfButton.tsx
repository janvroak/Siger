"use client";

import { ExternalLink, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, buttonClass } from "@/components/ui/Button";
import { Callout, Skeleton } from "@/components/ui/States";

/** Opens a PDF that has to be fetched with the bearer token in a new tab. */
export function OpenPdfButton({
  load,
  label = "View PDF",
  className = buttonClass("secondary", "sm"),
}: {
  load: () => Promise<Blob>;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function open() {
    // Open the tab synchronously, inside the click, so pop-up blockers allow it;
    // the PDF is shown once it arrives.
    const tab = window.open("", "_blank");
    setState("loading");
    try {
      const url = URL.createObjectURL(await load());
      if (tab) {
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState("idle");
    } catch {
      tab?.close();
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button className={className} onClick={() => void open()} disabled={state === "loading"}>
        <ExternalLink size={14} aria-hidden />
        {state === "loading" ? "Opening…" : label}
      </button>
      {state === "error" ? (
        <span className="mt-1 text-xs text-danger" role="alert">
          Could not open the PDF.
        </span>
      ) : null}
    </span>
  );
}

/** The same token-protected PDF, embedded in the page. */
export function PdfViewer({ load, title }: { load: () => Promise<Blob>; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    load()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // load is recreated on every render by callers; attempt drives reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (failed) {
    return (
      <Callout
        tone="danger"
        title="Could not load the PDF"
        action={
          <Button size="sm" icon={FileText} onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!url) {
    return <Skeleton className="h-full min-h-96 w-full" />;
  }
  return <iframe src={url} title={title} className="h-full min-h-[28rem] w-full rounded-lg border border-line bg-white" />;
}
