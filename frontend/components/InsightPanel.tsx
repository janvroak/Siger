"use client";

import {
  ArrowUp,
  CheckCircle2,
  Database,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { Callout, Skeleton } from "@/components/ui/States";
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
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line bg-[linear-gradient(180deg,var(--accent-soft),transparent)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Sparkles size={17} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-fg">AI insights</h2>
              <p className="mt-0.5 max-w-xl text-sm text-muted">
                The analytics agent reads the data through fixed SQL queries. Every number it writes is
                checked against the query results.
              </p>
            </div>
          </div>
          {!result ? (
            <Button variant="primary" icon={Sparkles} loading={busy} onClick={() => void ask("")}>
              {busy ? "Analysing…" : "Generate insight"}
            </Button>
          ) : null}
        </div>

        <form className="mt-4 flex gap-2" onSubmit={submit}>
          <label htmlFor="insight-question" className="sr-only">
            Ask the analytics agent
          </label>
          <input
            id="insight-question"
            className={inputClass}
            value={question}
            maxLength={500}
            placeholder="Ask a question, e.g. which topic should we revise first?"
            onChange={(event) => setQuestion(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" icon={ArrowUp} disabled={busy || !question.trim()}>
            Ask
          </Button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted transition-colors hover:border-accent-line hover:text-fg disabled:opacity-50"
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
      </div>

      {busy ? (
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" role="status">
          <div className="space-y-2.5">
            <p className="mb-3 text-sm text-muted">Querying the data and checking every number… this can take up to a minute.</p>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-36" />
        </div>
      ) : null}
      {error ? (
        <div className="p-5 sm:p-6">
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}

      {result && !busy ? (
        <div className="grid animate-fade-in lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-medium text-muted">{result.question}</p>
            {result.insight ? (
              <>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-fg">
                  {result.insight.split("\n").filter(Boolean).map((line, index) =>
                    line.trim().startsWith("- ") ? (
                      <p key={index} className="flex gap-2.5">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        <span>{line.trim().slice(2)}</span>
                      </p>
                    ) : (
                      <p key={index}>{line}</p>
                    ),
                  )}
                </div>
                <Badge tone="success" icon={ShieldCheck} className="mt-4">
                  Every number matches the query results
                </Badge>
              </>
            ) : (
              <Callout tone="warning" icon={ShieldAlert} title="Answer withheld" className="mt-3">
                It contained figures that are not in the data ({result.unsupported_numbers.join(", ") || "no answer"}).
                The dashboard numbers below are exact; try asking again.
              </Callout>
            )}
          </div>

          <aside className="border-t border-line bg-surface-2/60 p-5 sm:p-6 lg:border-t-0 lg:border-l">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-muted">
              <Database size={14} aria-hidden />
              Numbers used · {queries.length} quer{queries.length === 1 ? "y" : "ies"}
            </h3>
            {queries.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No queries were run.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {queries.map((call, index) => (
                  <li key={index}>
                    <details className="group rounded-lg border border-line bg-surface">
                      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px]">
                        {call.error ? (
                          <XCircle size={14} className="shrink-0 text-danger" aria-label="Refused" />
                        ) : (
                          <CheckCircle2 size={14} className="shrink-0 text-success" aria-label="Ran" />
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium text-fg">{TOOL_LABEL[call.tool] ?? call.tool}</span>
                        <span className="text-[11px] text-subtle group-open:hidden">Show</span>
                        <span className="hidden text-[11px] text-subtle group-open:inline">Hide</span>
                      </summary>
                      <div className="border-t border-line px-3 py-2.5">
                        {call.error ? (
                          <p className="text-xs text-danger">Refused: {call.error}</p>
                        ) : (
                          <ResultPreview value={call.result} />
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Shows a query result as a small table (rows) or key/value list, as plain text. */
function ResultPreview({ value }: { value: unknown }) {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value as Record<string, unknown>).find(Array.isArray) ?? null
      : null;

  if (Array.isArray(rows) && rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null) {
    const keys = Object.keys(rows[0] as Record<string, unknown>)
      .filter((k) => !k.endsWith("_id"))
      .slice(0, 4);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] tabular-nums">
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k} className="pr-3 pb-1 font-medium whitespace-nowrap text-muted">
                  {k.replaceAll("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, i) => (
              <tr key={i} className="border-t border-line">
                {keys.map((k) => (
                  <td key={k} className="max-w-40 truncate py-1 pr-3 text-fg">
                    {formatCell((row as Record<string, unknown>)[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 8 ? <p className="mt-1 text-[11px] text-muted">+ {rows.length - 8} more rows</p> : null}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([k]) => !k.endsWith("_id"));
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        {entries.slice(0, 10).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k.replaceAll("_", " ")}</dt>
            <dd className="truncate text-fg tabular-nums">{formatCell(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return <p className="text-[11px] text-fg">{formatCell(value)}</p>;
}
