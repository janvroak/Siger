"use client";

import type { LucideIcon } from "lucide-react";
import { KeyboardEvent, useRef } from "react";

import { cn } from "@/components/ui/Button";

export type TabItem<T extends string> = { id: T; label: string; icon?: LucideIcon; count?: number };

/** Segmented tabs with arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) {
      return;
    }
    event.preventDefault();
    const next = (index + delta + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150",
              active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon size={14} aria-hidden /> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <span className="rounded bg-surface-3 px-1 text-[11px] tabular-nums text-muted">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
