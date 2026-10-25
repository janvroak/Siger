import { AlertTriangle, BookMarked, Check, Flag, Lightbulb, RefreshCw, X } from "lucide-react";
import { ReactNode } from "react";

import { Badge, PointChip, Tag } from "@/components/ui/Badge";
import { cn } from "@/components/ui/Button";
import { ConfidenceMeter, ScoreRing } from "@/components/ui/Metrics";
import type { QuestionResult } from "@/lib/api";

/** One question's AI evaluation, with everything that explains the marks. */
export function QuestionResultCard({
  result,
  feedbackEditable = false,
  active,
  onActivate,
  showAnswer = true,
  children,
}: {
  result: QuestionResult;
  /** The feedback text is edited in the decision panel, so only its sources show here. */
  feedbackEditable?: boolean;
  /** Highlighted as the question being read in the split view. */
  active?: boolean;
  onActivate?: () => void;
  /** Show the student's answer inline (hidden on wide screens where the reader shows it). */
  showAnswer?: boolean | "mobile";
  /** Extra controls under the card (e.g. faculty override). */
  children?: ReactNode;
}) {
  return (
    <li
      id={`question-${result.question_id}`}
      onFocusCapture={onActivate}
      onMouseDown={onActivate}
      className={cn(
        "scroll-mt-6 overflow-hidden rounded-xl border bg-surface shadow-sm transition-[border-color,box-shadow] duration-200",
        result.flagged ? "border-warning-line" : "border-line",
        active && (result.flagged ? "ring-2 ring-warning/40" : "ring-2 ring-accent/30"),
      )}
    >
      {result.flagged ? (
        <div className="flex items-center gap-2 border-b border-warning-line bg-warning-soft px-5 py-2 text-[13px] text-fg">
          <Flag size={14} className="shrink-0 text-warning" fill="currentColor" aria-hidden />
          <span className="font-semibold">Flagged for review</span>
          <span className="hidden text-muted sm:inline">
            · AI marks and the similarity check still disagreed after a re-check
          </span>
        </div>
      ) : null}

      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-bold text-fg">Q{result.position}</span>
              <Tag>{result.topic}</Tag>
              {result.rechecked ? (
                <Badge tone="info" icon={RefreshCw} size="sm">
                  Re-checked
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg">{result.text}</p>
          </div>
          <ScoreRing value={result.ai_marks} max={result.max_marks} label={`AI marks ${result.ai_marks} of ${result.max_marks}`} />
        </div>

        {showAnswer ? (
          <details className={cn("group mt-4 rounded-lg border border-line bg-surface-2", showAnswer === "mobile" && "lg:hidden")}>
            <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-semibold text-muted transition-colors hover:text-fg">
              Student&apos;s answer
            </summary>
            <p className="border-t border-line px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">
              {result.student_answer || <span className="text-muted italic">No answer found</span>}
            </p>
          </details>
        ) : null}

        <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
          <Signal label="AI marks">
            <span className="tabular-nums">
              {result.ai_marks}
              <span className="font-normal text-muted"> / {result.max_marks}</span>
            </span>
          </Signal>
          <Signal label="Similarity">
            <span className="tabular-nums">{result.similarity === null ? "n/a" : result.similarity.toFixed(2)}</span>
          </Signal>
          <div className="bg-surface px-3.5 py-2.5">
            <ConfidenceMeter value={result.confidence} />
          </div>
        </dl>

        <div className="mt-4 space-y-3">
          <PointGroup title="Covered" items={result.key_points_hit} tone="success" icon={Check} />
          <PointGroup title="Missed" items={result.key_points_missed} tone="danger" icon={X} />
          <PointGroup title="Incorrect" items={result.incorrect_points} tone="warning" icon={AlertTriangle} />
        </div>

        <div className="mt-4 flex gap-3 rounded-lg border-l-2 border-accent bg-surface-2 px-4 py-3">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="text-xs font-semibold text-muted">Why these marks</p>
            <p className="mt-0.5 leading-relaxed text-fg">{result.rationale}</p>
          </div>
        </div>

        {!feedbackEditable ? (
          <div className="mt-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-accent-text">Feedback for the student</p>
            <p className="mt-1 leading-relaxed text-fg">{result.feedback}</p>
            <SourceChips sources={result.feedback_sources} />
          </div>
        ) : null}

        {children}
      </div>
    </li>
  );
}

function Signal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-fg">{children}</dd>
    </div>
  );
}

function PointGroup({
  title,
  items,
  tone,
  icon,
}: {
  title: string;
  items: string[];
  tone: "success" | "danger" | "warning";
  icon: typeof Check;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">
        {title} <span className="font-normal tabular-nums">({items.length})</span>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <PointChip key={item} tone={tone} icon={icon}>
            {item}
          </PointChip>
        ))}
      </ul>
    </div>
  );
}

/** Lecture pages the feedback points to. */
export function SourceChips({ sources }: { sources: { filename: string; page: number }[] }) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <li
          key={`${source.filename}:${source.page}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted"
        >
          <BookMarked size={12} className="shrink-0 text-accent-text" aria-hidden />
          <span className="truncate">{source.filename}</span>
          <span className="shrink-0 font-medium text-fg">p. {source.page}</span>
        </li>
      ))}
    </ul>
  );
}
