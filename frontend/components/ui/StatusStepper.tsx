import { Check, AlertTriangle } from "lucide-react";

import { cn } from "@/components/ui/Button";

export type Step = { label: string; description?: string };

/**
 * Horizontal stepper. Steps before `current` are done, `current` is active
 * (animated ring), the rest are upcoming. `failed` marks the current step red.
 */
export function StatusStepper({
  steps,
  current,
  failed,
  complete,
}: {
  steps: Step[];
  current: number;
  failed?: boolean;
  /** Every step is done (e.g. the grade is published). */
  complete?: boolean;
}) {
  return (
    <ol className="flex w-full items-start" aria-label="Progress">
      {steps.map((step, index) => {
        const done = complete || index < current;
        const active = !complete && index === current;
        const last = index === steps.length - 1;
        return (
          <li
            key={step.label}
            className="relative flex flex-1 flex-col items-center text-center"
            aria-current={active ? "step" : undefined}
          >
            {!last ? (
              <span
                aria-hidden
                className="absolute top-[13px] left-[calc(50%+18px)] h-0.5 w-[calc(100%-36px)] overflow-hidden rounded-full bg-surface-3"
              >
                <span
                  className="block h-full bg-accent transition-[width] duration-500 ease-out"
                  style={{ width: done ? "100%" : "0%" }}
                />
              </span>
            ) : null}
            <span
              className={cn(
                "relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-300",
                done && "border-accent bg-accent text-accent-fg",
                active && !failed && "animate-pulse-ring border-accent bg-surface text-accent-text",
                active && failed && "border-danger bg-danger-soft text-danger",
                !done && !active && "border-line-strong bg-surface text-subtle",
              )}
            >
              {done ? (
                <Check size={14} strokeWidth={3} aria-hidden />
              ) : active && failed ? (
                <AlertTriangle size={13} strokeWidth={2.5} aria-hidden />
              ) : active ? (
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                "mt-2 px-1 text-xs font-medium leading-tight sm:text-[13px]",
                done || active ? "text-fg" : "text-muted",
              )}
            >
              {step.label}
              <span className="sr-only">{done ? " (done)" : active ? " (current)" : " (upcoming)"}</span>
            </span>
            {step.description ? (
              <span className="mt-0.5 hidden px-1 text-[11px] text-muted sm:block">{step.description}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
