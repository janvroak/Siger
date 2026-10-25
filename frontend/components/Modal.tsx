"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

import { IconButton } from "@/components/ui/Button";

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, description, onClose, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the first field (or the dialog) so keyboard users land inside.
    const first = panel.current?.querySelector<HTMLElement>("[autofocus], input, textarea, select, button");
    (first ?? panel.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) {
        return;
      }
      // Keep Tab inside the dialog.
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
      )];
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="w-full max-w-lg animate-pop-in rounded-xl border border-line bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-fg">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-2" />
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
