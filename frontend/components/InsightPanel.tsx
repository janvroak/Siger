"use client";

import { FormEvent, useState } from "react";

import { inputClass, primaryButton, secondaryButton } from "@/components/Modal";
import { ApiError, askAnalytics, type AnalyticsInsight } from "@/lib/api";

const TOOL_LABEL: Record<string, string> = {
  list_assignments: "Assignments",
  list_students: "Student standings",
  class_topic_averages: "Topic averages for an assignment",
  completion_rate: "Completion of an assignment",
  overdue_students: "Overdue students",
  weakest_topics: "Weakest topics",
  student_topic_mastery: "Topic mastery",
  score_trend: "Score trend",
  ai_grading_agreement: "AI grading agreement",
};

/**
 * Ask the analytics agent. It reads the data only through fixed SQL queries,
 * and every number it writes is checked against their results.
 */
export function InsightPanel({
  token,
  courseId,
  studentId,
  suggestions,
}: {
  token: string;
  courseId: string;
  /** Faculty looking at one student's progress. */
  studentId?: string;
  suggestions: string[];
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyticsInsight | null>(null);
  const [error, setError] = useState("");

  async function ask(text: string) {
    setBusy(true);
    setError("");
    try {
      setResult(await askAnalytics(token, courseId, { question: text, student_id: studentId }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The analytics agent failed.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question.trim());
  }

  const queries = result?.tool_calls ?? [];

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">AI insights</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            The analytics agent reads the data through fixed SQL queries and explains it. Every
            number it writes is checked against the query results.
          </p>
        </div>
        {!result ? (
          <button className={primaryButton} onClick={() => void ask("")} disabled={busy}>
            {busy ? "Analysing…" : "Generate insight"}
          </button>
        ) : null}
      </div>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <input
          className={`${inputClass} mt-0 bg-white`}
          value={question}
          maxLength={500}
          placeholder="Or ask a question, e.g. which topic should we revise first?"
          onChange={(event) => setQuestion(event.target.value)}
          disabled={busy}
        />
        <button className={secondaryButton} type="submit" disabled={busy || !question.trim()}>
          Ask
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
            disabled={busy}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {busy ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-indigo-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          Querying the data and checking every number… this can take up to a minute.
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      {result && !busy ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500">{result.question}</p>
          {result.insight ? (
            <>
              <div className="mt-2 space-y-1.5 text-sm text-slate-800">
                {result.insight.split("\n").filter(Boolean).map((line, index) =>
                  line.trim().startsWith("- ") ? (
                    <p key={index} className="flex gap-2">
                      <span className="text-indigo-500">•</span>
                      <span>{line.trim().slice(2)}</span>
                    </p>
                  ) : (
                    <p key={index}>{line}</p>
                  ),
                )}
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                ✓ Every number matches the query results
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-800">
              The agent&apos;s answer was withheld because it contained figures that are not in the
              data ({result.unsupported_numbers.join(", ") || "no answer"}). The dashboard numbers
              below are exact; try asking again.
            </p>
          )}
          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer">
              Data used ({queries.length} quer{queries.length === 1 ? "y" : "ies"})
            </summary>
            <ul className="mt-2 space-y-1">
              {queries.map((call, index) => (
                <li key={index}>
                  {call.error ? "✕" : "✓"} {TOOL_LABEL[call.tool] ?? call.tool}
                  {call.error ? <span className="text-red-700"> — refused: {call.error}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </section>
  );
}
