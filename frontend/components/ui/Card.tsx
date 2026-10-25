import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/components/ui/Button";

export function Card({
  className,
  padded = true,
  as: Tag = "section",
  ...rest
}: HTMLAttributes<HTMLElement> & { padded?: boolean; as?: "section" | "div" | "article" | "li" }) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-line bg-surface shadow-sm",
        padded && "p-5 sm:p-6",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Page container: max width, gutters and the page title block. */
export function Page({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "narrow" | "default" | "wide" | "full";
  className?: string;
}) {
  const max = {
    narrow: "max-w-3xl",
    default: "max-w-5xl",
    wide: "max-w-7xl",
    full: "max-w-none",
  }[width];
  return (
    <div className={cn("mx-auto w-full px-4 py-6 animate-fade-in sm:px-6 lg:px-8 lg:py-8", max, className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  back,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 lg:mb-8">
      {back ? (
        <Link
          href={back.href}
          className="group mb-3 inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-[28px] sm:leading-9">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** A titled block of page content with an optional count and action. */
export function Section({
  title,
  count,
  description,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  count?: number;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("mt-8 scroll-mt-20 first:mt-0", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            {title}
            {count !== undefined ? (
              <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-sans text-xs font-medium tabular-nums text-muted">
                {count}
              </span>
            ) : null}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
