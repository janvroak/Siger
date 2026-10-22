"use client";

import { useState } from "react";

import { secondaryButton } from "@/components/Modal";

/** Opens a PDF that has to be fetched with the bearer token in a new tab. */
export function OpenPdfButton({
  load,
  label = "View PDF ↗",
  className = secondaryButton,
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
        {state === "loading" ? "Opening…" : label}
      </button>
      {state === "error" ? (
        <span className="mt-1 text-xs text-red-700">Could not open the PDF.</span>
      ) : null}
    </span>
  );
}
