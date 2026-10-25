"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

import { cn } from "@/components/ui/Button";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; body?: string };

type ToastApi = {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const STYLE: Record<ToastTone, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: "text-success" },
  error: { icon: AlertCircle, color: "text-danger" },
  info: { icon: Info, color: "text-info" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, tone, title, body }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push("success", title, body),
      error: (title, body) => push("error", title, body),
      info: (title, body) => push("info", title, body),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {items.map((item) => {
          const { icon: Icon, color } = STYLE[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full animate-pop-in items-start gap-3 rounded-xl border border-line bg-surface p-3.5 pr-2.5 shadow-lg sm:w-[22rem]"
            >
              <Icon size={18} className={cn("mt-0.5 shrink-0", color)} aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-fg">{item.title}</p>
                {item.body ? <p className="mt-0.5 text-muted">{item.body}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return api;
}
