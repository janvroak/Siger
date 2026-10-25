import { ChevronDown } from "lucide-react";
import { ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "@/components/ui/Button";

export const inputClass = cn(
  "block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg shadow-sm",
  "placeholder:text-subtle transition-[border-color,box-shadow] duration-150",
  "hover:border-subtle focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20",
);

/** Label + control + optional hint or error, stacked on the 8px grid. */
export function Field({
  label,
  hint,
  error,
  badge,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
        {label}
        {badge}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(inputClass, "appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-subtle"
      />
    </span>
  );
}
