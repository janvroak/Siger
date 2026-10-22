"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

export function pct(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

/** A titled card that every chart sits in, with an optional "view as table". */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold" style={{ color: "var(--viz-text-primary)" }}>
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-sm" style={{ color: "var(--viz-text-secondary)" }}>
          {subtitle}
        </p>
      ) : null}
      {legend ? <div className="mt-3">{legend}</div> : null}
      <div className="mt-4">{children}</div>
      {table ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer" style={{ color: "var(--viz-text-secondary)" }}>
            View as table
          </summary>
          <div className="mt-2 overflow-x-auto">{table}</div>
        </details>
      ) : null}
    </section>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--viz-text-secondary)" }}>
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Status is never color alone: an icon and a word go with it. */
export function GapBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-medium"
      style={{ borderColor: "var(--viz-critical)", color: "var(--viz-text-primary)" }}
    >
      <span aria-hidden style={{ color: "var(--viz-critical)" }}>
        ▲
      </span>
      Gap
    </span>
  );
}

export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm" style={{ color: "var(--viz-text-secondary)" }}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold" style={{ color: "var(--viz-text-primary)" }}>
        {value}
      </p>
      {note ? (
        <p className="mt-1 text-xs" style={{ color: "var(--viz-text-muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: y - 8, color: "var(--viz-text-primary)" }}
    >
      {children}
    </div>
  );
}

/** Width of a container, kept current on resize (for SVG charts). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export const tableClass = "w-full text-left text-sm tabular-nums";
export const thClass = "border-b border-slate-200 py-1.5 pr-4 text-xs font-medium text-slate-500";
export const tdClass = "border-b border-slate-100 py-1.5 pr-4";
