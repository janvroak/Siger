import type { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/components/ui/Button";

type MetricTone = "accent" | "success" | "warning" | "danger" | "neutral";

const ICON_TONE: Record<MetricTone, string> = {
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted",
};

/** KPI tile: icon, label, a big tabular number and a one-line note. */
export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "accent",
  emphasis,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone;
  /** A faint tinted wash, used for the headline metric of a page. */
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5",
        emphasis &&
          "bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_70%)] border-accent-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icon ? (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
            <Icon size={16} aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-display text-2xl leading-8 font-bold tracking-tight text-fg tabular-nums sm:text-[28px] sm:leading-9">
        {value}
      </p>
      {note ? <p className="mt-1 line-clamp-2 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function ratioTone(ratio: number): { stroke: string; text: string } {
  if (ratio >= 0.75) return { stroke: "var(--success)", text: "text-success" };
  if (ratio >= 0.5) return { stroke: "var(--warning)", text: "text-warning" };
  return { stroke: "var(--danger)", text: "text-danger" };
}

/** Circular marks indicator; the number inside always states the value. */
export function ScoreRing({
  value,
  max,
  size = 56,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  label?: string;
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const stroke = size >= 72 ? 6 : 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const { stroke: color } = ratioTone(ratio);
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${value} of ${max} marks`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn("font-display font-bold tabular-nums text-fg", size >= 72 ? "text-xl" : "text-sm")}>
          {value}
        </span>
        <span className={cn("tabular-nums text-muted", size >= 72 ? "mt-1 text-xs" : "mt-0.5 text-[10px]")}>
          / {max}
        </span>
      </span>
    </div>
  );
}

/** Compact "7 / 10" chip coloured by the score band, with the number as the signal. */
export function ScoreChip({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? value / max : 0;
  const tone =
    ratio >= 0.75
      ? "bg-success-soft text-success border-success-line"
      : ratio >= 0.5
        ? "bg-warning-soft text-warning border-warning-line"
        : "bg-danger-soft text-danger border-danger-line";
  return (
    <span className={cn("inline-flex items-baseline gap-0.5 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums", tone)}>
      {value}
      <span className="font-normal opacity-80">/ {max}</span>
    </span>
  );
}

/** Horizontal meter with a stated percentage; low values also get the word "Low". */
export function ConfidenceMeter({ value, threshold = 0.6 }: { value: number; threshold?: number }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  const low = value < threshold;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Confidence</span>
        <span className={cn("font-semibold tabular-nums", low ? "text-warning" : "text-fg")}>
          {percent}%{low ? " · Low" : ""}
        </span>
      </div>
      <div
        className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-label="Grading confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", low ? "bg-warning" : "bg-success")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Thin progress bar. Omit value for an indeterminate (unknown-length) state. */
export function ProgressBar({ value, label, className }: { value?: number; label: string; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={value === undefined ? undefined : 0}
      aria-valuemax={value === undefined ? undefined : 100}
      aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}
      className={cn("relative h-1.5 overflow-hidden rounded-full bg-surface-3", className)}
    >
      {value === undefined ? (
        <div className="absolute inset-y-0 w-1/3 animate-indeterminate rounded-full bg-accent" />
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${value * 100}%` }} />
      )}
    </div>
  );
}
