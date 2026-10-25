import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/components/ui/Button";

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[length:200%_100%]",
        "bg-[linear-gradient(90deg,var(--surface-2)_25%,var(--surface-3)_50%,var(--surface-2)_75%)]",
        className,
      )}
    />
  );
}

/** A page-shaped loading state: header plus a few cards. */
export function PageSkeleton({ cards = 3, label = "Loading" }: { cards?: number; label?: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8" role="status" aria-label={label}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-6 space-y-4">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={19} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-fg">{title}</p>
      {body ? <p className="mt-1 max-w-md text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertCircle size={22} aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-fg">{title}</h1>
      <p className="mt-1 text-sm text-muted" role="alert">
        {children}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

const CALLOUT = {
  info: { icon: Info, box: "border-info-line bg-info-soft", icon_: "text-info" },
  success: { icon: CheckCircle2, box: "border-success-line bg-success-soft", icon_: "text-success" },
  warning: { icon: AlertTriangle, box: "border-warning-line bg-warning-soft", icon_: "text-warning" },
  danger: { icon: AlertCircle, box: "border-danger-line bg-danger-soft", icon_: "text-danger" },
  accent: { icon: Info, box: "border-accent-line bg-accent-soft", icon_: "text-accent-text" },
} as const;

/** Inline message with an icon; the text stays in the normal ink colour for contrast. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: keyof typeof CALLOUT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const style = CALLOUT[tone];
  const Icon = icon ?? style.icon;
  return (
    <div
      className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm", style.box, className)}
      role={tone === "danger" ? "alert" : undefined}
    >
      <Icon size={17} className={cn("mt-0.5 shrink-0", style.icon_)} aria-hidden />
      <div className="min-w-0 flex-1 text-fg">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5 text-muted" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
