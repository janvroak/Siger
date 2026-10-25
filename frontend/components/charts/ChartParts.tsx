"use client";

import { Table2, TriangleAlert } from "lucide-react";
import { ReactNode, useState } from "react";

import { cn } from "@/components/ui/Button";

export function pct(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

/** A titled card that every chart sits in, with a "table view" toggle for accessibility. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cn("flex flex-col rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table ? (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                showTable ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Table2 size={14} aria-hidden />
              Table
            </button>
          ) : null}
        </div>
      </div>
      {legend ? <div className="mt-3">{legend}</div> : null}
      <div className="mt-4 flex-1">
        {showTable && table ? <div className="overflow-x-auto">{table}</div> : children}
      </div>
    </section>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Status is never colour alone: an icon and a word go with it. */
export function GapBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-danger-line bg-danger-soft px-1.5 py-px text-[11px] font-medium text-danger">
      <TriangleAlert size={11} strokeWidth={2.5} aria-hidden />
      Gap
    </span>
  );
}

/** Tooltip body used by every Recharts chart. */
export function ChartTooltip({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-fg">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <p key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              {row.color ? <span className="h-2 w-2 rounded-[2px]" style={{ background: row.color }} /> : null}
              {row.label}
            </span>
            <span className="font-medium text-fg tabular-nums">{row.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Shared axis styling: small muted text, no tick lines. */
export const axisProps = {
  tick: { fill: "var(--viz-text-muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const tableClass = "w-full text-left text-sm tabular-nums";
export const thClass = "border-b border-line bg-surface-2 px-3 py-2 text-xs font-medium text-muted first:rounded-tl-lg last:rounded-tr-lg";
export const tdClass = "border-b border-line px-3 py-2 text-fg";
