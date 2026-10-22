"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { plural } from "@/components/CourseCard";
import { primaryButton } from "@/components/Modal";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { QuestionResultCard } from "@/components/QuestionResultCard";
import { StatusBadge } from "@/components/SubmissionStatus";
import {
  ApiError,
  getSubmissionPdf,
  getSubmissionResults,
  regradeSubmission,
  type SubmissionResults,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

const POLL_MS = 5_000;

export default function SubmissionResultsPage() {
  const { courseId, assignmentId, submissionId } = useParams<{
    courseId: string;
    assignmentId: string;
    submissionId: string;
  }>();
  const { token, user, error: authError } = useAuthedUser();
  const [results, setResults] = useState<SubmissionResults | null>(null);
  const [pageError, setPageError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(
    (activeToken: string) =>
      getSubmissionResults(activeToken, courseId, assignmentId, submissionId)
        .then(setResults)
        .catch((caught: unknown) =>
          setPageError(
            caught instanceof ApiError && caught.status === 403
              ? "Only the course professor can see AI evaluations."
              : caught instanceof ApiError && caught.status === 404
                ? "This submission does not exist."
                : "Unable to load the submission.",
          ),
        ),
    [courseId, assignmentId, submissionId],
  );

  useEffect(() => {
    if (token) {
      void load(token);
    }
  }, [token, load]);

  const status = results?.submission.status;
  const grading = status === "submitted" || status === "evaluating";
  useEffect(() => {
    if (!token || !grading) {
      return;
    }
    const timer = setInterval(() => void load(token), POLL_MS);
    return () => clearInterval(timer);
  }, [token, grading, load]);

  async function retry() {
    if (!token) {
      return;
    }
    setRetrying(true);
    try {
      await regradeSubmission(token, courseId, assignmentId, submissionId);
      await load(token);
    } finally {
      setRetrying(false);
    }
  }

  const error = authError || pageError;
  const assignmentUrl = `/courses/${courseId}/assignments/${assignmentId}`;

  return (
    <AppShell user={user} token={token}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!results && !error ? <PageMessage>Loading submission…</PageMessage> : null}

      {results && token ? (
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href={assignmentUrl}>
            ← Assignment
          </Link>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <StatusBadge audience="faculty" state={results.submission.status} />
                <h1 className="mt-2 text-2xl font-semibold">{results.student_name}</h1>
                <p className="text-sm text-slate-500">
                  {results.student_email} · submitted{" "}
                  {new Date(results.submission.submitted_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {results.questions.length > 0 ? (
                  <p className="text-right">
                    <span className="text-3xl font-semibold tabular-nums">
                      {results.total_ai_marks}
                    </span>
                    <span className="text-slate-500"> / {results.total_marks}</span>
                    <span className="block text-xs text-slate-500">AI marks, not yet reviewed</span>
                  </p>
                ) : null}
                <OpenPdfButton
                  label="Submitted PDF ↗"
                  load={() => getSubmissionPdf(token, courseId, assignmentId, submissionId)}
                />
              </div>
            </div>

            {grading ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
                The evaluation agent is grading this submission. This page updates automatically.
              </p>
            ) : null}
            {status === "failed" ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <span>Grading failed: {results.error ?? "unknown error"}</span>
                <button className={primaryButton} onClick={() => void retry()} disabled={retrying}>
                  {retrying ? "Starting…" : "Retry grading"}
                </button>
              </div>
            ) : null}
            {results.flagged_count > 0 ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                ⚑ {plural(results.flagged_count, "question")} flagged: the AI marks and the
                similarity check still disagreed after a re-check. Please review{" "}
                {results.flagged_count === 1 ? "it" : "them"} closely.
              </p>
            ) : null}
          </section>

          <ol className="mt-6 space-y-4">
            {results.questions.map((question) => (
              <QuestionResultCard key={question.question_id} result={question} />
            ))}
          </ol>

          {results.grading_trace.length > 0 ? (
            <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
              <summary className="cursor-pointer font-medium">
                How this was graded ({plural(results.grading_trace.length, "step")})
              </summary>
              <ol className="mt-3 space-y-1.5">
                {results.grading_trace.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <code className="w-36 shrink-0 text-xs text-indigo-700">{step.node}</code>
                    <span className="text-slate-600">{step.detail}</span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}
