import type { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/components/ui/Button";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent-soft text-accent-text border-accent-line",
  success: "bg-success-soft text-success border-success-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  danger: "bg-danger-soft text-danger border-danger-line",
  info: "bg-info-soft text-info border-info-line",
};

/** Small status label. Pass an icon for any status so colour is never the only signal. */
export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
  size = "md",
  pulse,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
  /** Animated dot for in-progress states. */
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-medium",
        size === "sm" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs",
        TONE[tone],
        className,
      )}
    >
      {pulse ? (
        <span className="relative mr-0.5 flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : Icon ? (
        <Icon size={size === "sm" ? 11 : 12} strokeWidth={2.25} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

/** Neutral tag for topics and other plain metadata. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Key-point chip: covered (check), missed (x) or incorrect (alert). */
export function PointChip({
  tone,
  icon: Icon,
  children,
}: {
  tone: "success" | "danger" | "warning";
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "inline-flex max-w-full items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] leading-snug",
        TONE[tone],
      )}
    >
      <Icon size={14} strokeWidth={2.5} className="mt-px shrink-0" aria-hidden />
      <span className="min-w-0 break-words text-fg">{children}</span>
    </li>
  );
}
