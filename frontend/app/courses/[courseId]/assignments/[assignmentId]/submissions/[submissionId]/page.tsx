"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { plural } from "@/components/CourseCard";
import { inputClass, primaryButton, secondaryButton } from "@/components/Modal";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { QuestionResultCard } from "@/components/QuestionResultCard";
import { StatusBadge } from "@/components/SubmissionStatus";
import {
  ApiError,
  getSubmissionPdf,
  getSubmissionResults,
  regradeSubmission,
  reviewSubmission,
  type QuestionResult,
  type ReviewLogEntry,
  type SubmissionResults,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

const POLL_MS = 5_000;

type Draft = { marks: string; feedback: string };

function draftsFrom(results: SubmissionResults): Record<string, Draft> {
  return Object.fromEntries(
    results.questions.map((question) => [
      question.question_id,
      {
        marks: String(question.final_marks ?? question.ai_marks),
        feedback: question.feedback,
      },
    ]),
  );
}

export default function SubmissionResultsPage() {
  const { courseId, assignmentId, submissionId } = useParams<{
    courseId: string;
    assignmentId: string;
    submissionId: string;
  }>();
  const { token, user, error: authError } = useAuthedUser();
  const [results, setResults] = useState<SubmissionResults | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pageError, setPageError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const show = useCallback((loaded: SubmissionResults) => {
    setResults(loaded);
    setDrafts(draftsFrom(loaded));
  }, []);

  const load = useCallback(
    (activeToken: string) =>
      getSubmissionResults(activeToken, courseId, assignmentId, submissionId)
        .then(show)
        .catch((caught: unknown) =>
          setPageError(
            caught instanceof ApiError && caught.status === 403
              ? "Only the course professor can see AI evaluations."
              : caught instanceof ApiError && caught.status === 404
                ? "This submission does not exist."
                : "Unable to load the submission.",
          ),
        ),
    [courseId, assignmentId, submissionId, show],
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
  const reviewable = status === "under_review" || status === "published";

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
                {results.published_at ? (
                  <p className="mt-1 text-sm text-emerald-700">
                    Published {new Date(results.published_at).toLocaleString()} — visible to the
                    student
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {results.questions.length > 0 ? (
                  <p className="text-right">
                    <span className="text-3xl font-semibold tabular-nums">
                      {results.total_ai_marks}
                    </span>
                    <span className="text-slate-500"> / {results.total_marks}</span>
                    <span className="block text-xs text-slate-500">AI marks</span>
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
              <QuestionResultCard
                key={question.question_id}
                result={question}
                feedbackEditable={reviewable}
              >
                {reviewable ? (
                  <ReviewControls
                    question={question}
                    draft={drafts[question.question_id]}
                    onChange={(change) =>
                      setDrafts((current) => ({
                        ...current,
                        [question.question_id]: { ...current[question.question_id], ...change },
                      }))
                    }
                  />
                ) : null}
              </QuestionResultCard>
            ))}
          </ol>

          {results.review_log.length > 0 ? <ReviewHistory entries={results.review_log} /> : null}

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

          {reviewable ? (
            <ReviewBar
              results={results}
              drafts={drafts}
              onSubmit={async (publish) => {
                show(
                  await reviewSubmission(token, courseId, assignmentId, submissionId, {
                    publish,
                    questions: results.questions.map((question) => ({
                      question_id: question.question_id,
                      final_marks: Number(drafts[question.question_id].marks),
                      feedback: drafts[question.question_id].feedback.trim(),
                    })),
                  }),
                );
              }}
            />
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function ReviewControls({
  question,
  draft,
  onChange,
}: {
  question: QuestionResult;
  draft: Draft | undefined;
  onChange: (change: Partial<Draft>) => void;
}) {
  if (!draft) {
    return null;
  }
  const marks = Number(draft.marks);
  const overridden = draft.marks !== "" && marks !== question.ai_marks;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your decision</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Final marks
          <input
            className={`${inputClass} mt-0 w-24`}
            type="number"
            min={0}
            max={question.max_marks}
            step={0.5}
            value={draft.marks}
            onChange={(event) => onChange({ marks: event.target.value })}
          />
          <span className="font-normal text-slate-500">/ {question.max_marks}</span>
        </label>
        {overridden ? (
          <>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Override (AI: {question.ai_marks})
            </span>
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-800"
              onClick={() => onChange({ marks: String(question.ai_marks) })}
            >
              Use AI marks
            </button>
          </>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Approving AI marks
          </span>
        )}
      </div>
      <label className="mt-3 block text-sm font-medium">
        Feedback the student will see
        <textarea
          className={`${inputClass} min-h-20`}
          value={draft.feedback}
          maxLength={5000}
          onChange={(event) => onChange({ feedback: event.target.value })}
        />
      </label>
    </div>
  );
}

function ReviewBar({
  results,
  drafts,
  onSubmit,
}: {
  results: SubmissionResults;
  drafts: Record<string, Draft>;
  onSubmit: (publish: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const published = results.submission.status === "published";

  const values = results.questions.map((question) => ({
    question,
    draft: drafts[question.question_id],
  }));
  const invalid = values.find(
    ({ question, draft }) =>
      !draft ||
      draft.marks.trim() === "" ||
      Number.isNaN(Number(draft.marks)) ||
      Number(draft.marks) < 0 ||
      Number(draft.marks) > question.max_marks ||
      !draft.feedback.trim(),
  );
  const total = values.reduce((sum, { draft }) => sum + (Number(draft?.marks) || 0), 0);
  const overrides = values.filter(
    ({ question, draft }) => draft && Number(draft.marks) !== question.ai_marks,
  ).length;

  async function submit(publish: boolean) {
    setBusy(publish ? "publish" : "draft");
    setMessage(null);
    try {
      await onSubmit(publish);
      setMessage({
        tone: "ok",
        text: publish
          ? published
            ? "Published grade updated."
            : "Grade published — the student can now see it."
          : "Draft saved. The student cannot see it yet.",
      });
    } catch (caught) {
      setMessage({
        tone: "error",
        text: caught instanceof ApiError ? caught.message : "Could not save the review.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sticky bottom-0 -mx-6 mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur">
      <div className="mr-auto text-sm">
        <p>
          Final grade:{" "}
          <span className="text-lg font-semibold tabular-nums">{total}</span>
          <span className="text-slate-500"> / {results.total_marks}</span>
          {overrides > 0 ? (
            <span className="ml-2 text-amber-700">· {plural(overrides, "override")}</span>
          ) : null}
        </p>
        {invalid ? (
          <p className="text-red-700">
            Q{invalid.question.position}: enter marks between 0 and {invalid.question.max_marks}{" "}
            and some feedback.
          </p>
        ) : message ? (
          <p className={message.tone === "ok" ? "text-emerald-700" : "text-red-700"}>
            {message.text}
          </p>
        ) : null}
      </div>
      {!published ? (
        <button
          className={secondaryButton}
          disabled={!!invalid || busy !== null}
          onClick={() => void submit(false)}
        >
          {busy === "draft" ? "Saving…" : "Save draft"}
        </button>
      ) : null}
      <button
        className={primaryButton}
        disabled={!!invalid || busy !== null}
        onClick={() => void submit(true)}
      >
        {busy === "publish" ? "Publishing…" : published ? "Update published grade" : "Approve & publish"}
      </button>
    </div>
  );
}

function ReviewHistory({ entries }: { entries: ReviewLogEntry[] }) {
  return (
    <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
      <summary className="cursor-pointer font-medium">
        Review history ({entries.length} {entries.length === 1 ? "entry" : "entries"})
      </summary>
      <ol className="mt-3 space-y-1.5">
        {entries.map((entry, index) => (
          <li key={index} className="flex flex-wrap gap-x-3 text-slate-600">
            <span className="w-40 shrink-0 text-xs text-slate-400">
              {new Date(entry.created_at).toLocaleString()}
            </span>
            <span>
              <span className="font-medium text-slate-800">{entry.faculty_name}</span>{" "}
              {entry.action === "publish"
                ? "published the grade"
                : `${entry.action === "approve" ? "approved" : "overrode"} Q${entry.question_position}: AI ${entry.ai_marks} → ${entry.final_marks}`}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
