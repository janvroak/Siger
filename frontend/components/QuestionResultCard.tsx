import { ReactNode } from "react";

import type { QuestionResult } from "@/lib/api";

/** One question's AI evaluation, with everything that explains the marks. */
export function QuestionResultCard({
  result,
  children,
}: {
  result: QuestionResult;
  /** Extra controls under the card (e.g. faculty override). */
  children?: ReactNode;
}) {
  const percent = Math.round((result.ai_marks / result.max_marks) * 100);
  return (
    <li
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        result.flagged ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Q{result.position}</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {result.topic}
            </span>
            {result.flagged ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                ⚑ Flagged for review
              </span>
            ) : null}
            {result.rechecked ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                Re-checked
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-700">{result.text}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="text-2xl font-semibold tabular-nums">{result.ai_marks}</span>
          <span className="text-slate-500"> / {result.max_marks}</span>
          <span className="block text-xs text-slate-500">{percent}% · AI</span>
        </p>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Student&apos;s answer
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm">
          {result.student_answer || <span className="italic text-slate-400">No answer found</span>}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <PointList title="Covered" tone="text-emerald-700" marker="✓" items={result.key_points_hit} />
        <PointList title="Missed" tone="text-red-700" marker="✕" items={result.key_points_missed} />
        <PointList
          title="Incorrect"
          tone="text-amber-700"
          marker="!"
          items={result.incorrect_points}
        />
      </div>

      <p className="mt-4 text-sm">
        <span className="font-medium">Rationale: </span>
        <span className="text-slate-700">{result.rationale}</span>
      </p>

      <Signals similarity={result.similarity} confidence={result.confidence} />

      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Feedback for the student
        </p>
        <p className="mt-1 text-slate-800">{result.feedback}</p>
        {result.feedback_sources.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Points to:{" "}
            {result.feedback_sources
              .map((source) => `${source.filename}, p. ${source.page}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      {children}
    </li>
  );
}

function PointList({
  title,
  tone,
  marker,
  items,
}: {
  title: string;
  tone: string;
  marker: string;
  items: string[];
}) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      {items.length ? (
        <ul className="mt-1 space-y-1 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span className={tone}>{marker}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-400">—</p>
      )}
    </div>
  );
}

function Signals({ similarity, confidence }: { similarity: number | null; confidence: number }) {
  const low = confidence < 0.6;
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
      <span>
        Similarity to model answer:{" "}
        <span className="font-medium text-slate-700">
          {similarity === null ? "n/a" : similarity.toFixed(2)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        Confidence:
        <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
          <span
            className={`block h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.round(confidence * 100)}%` }}
          />
        </span>
        <span className={`font-medium ${low ? "text-amber-700" : "text-slate-700"}`}>
          {Math.round(confidence * 100)}%
        </span>
      </span>
    </div>
  );
}
