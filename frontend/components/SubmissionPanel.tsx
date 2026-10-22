"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { deadlineLabel } from "@/components/AssignmentList";
import { plural } from "@/components/CourseCard";
import { primaryButton } from "@/components/Modal";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { StatusBadge } from "@/components/SubmissionStatus";
import {
  ApiError,
  getMySubmission,
  getMySubmissionPdf,
  submitAssignment,
  type Submission,
} from "@/lib/api";

const POLL_MS = 15_000;

const STEPS = ["Submitted", "Being graded", "Graded"] as const;

function stepIndex(submission: Submission): number {
  return submission.status === "submitted" ? 0 : submission.status === "published" ? 2 : 1;
}

/** The student's side of an assignment: upload once, then follow its status. */
export function SubmissionPanel({
  token,
  courseId,
  assignmentId,
  deadline,
}: {
  token: string;
  courseId: string;
  assignmentId: string;
  deadline: string;
}) {
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(
    () =>
      getMySubmission(token, courseId, assignmentId)
        .then((loaded) => {
          setSubmission(loaded);
          setLoadError("");
        })
        .catch(() => setLoadError("Could not load your submission.")),
    [token, courseId, assignmentId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Grading runs in the background; check back until the grade is published.
  const waiting = submission != null && submission.status !== "published";
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const closed = deadlineLabel(deadline).closed;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your submission</h2>
        {submission !== undefined ? (
          <StatusBadge
            audience="student"
            state={submission?.status ?? (closed ? "overdue" : "not_submitted")}
          />
        ) : null}
      </div>

      {loadError ? <p className="mt-3 text-sm text-red-700">{loadError}</p> : null}
      {submission === undefined && !loadError ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : null}

      {submission ? (
        <>
          <ol className="mt-5 grid grid-cols-3 gap-2">
            {STEPS.map((step, index) => {
              const done = index <= stepIndex(submission);
              return (
                <li key={step} className="text-center text-xs">
                  <div className={`h-1.5 rounded-full ${done ? "bg-indigo-500" : "bg-slate-200"}`} />
                  <p className={`mt-2 ${done ? "font-medium text-slate-800" : "text-slate-400"}`}>
                    {step}
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm">
            <div>
              <p className="font-medium">{submission.filename}</p>
              <p className="text-slate-500">
                {plural(submission.page_count, "page")} · submitted{" "}
                {new Date(submission.submitted_at).toLocaleString()}
              </p>
            </div>
            <OpenPdfButton load={() => getMySubmissionPdf(token, courseId, assignmentId)} />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {submission.status === "published"
              ? "Your grade and feedback are ready."
              : "Your answers are graded by the AI and then checked by your professor. Your grade appears here once it is published."}
          </p>
        </>
      ) : null}

      {submission === null && closed ? (
        <p className="mt-3 text-sm text-slate-600">
          The deadline has passed and no submission was made.
        </p>
      ) : null}

      {submission === null && !closed ? (
        <UploadForm
          onSubmit={async (file) => {
            setSubmission(await submitAssignment(token, courseId, assignmentId, file));
          }}
        />
      ) : null}
    </section>
  );
}

function UploadForm({ onSubmit }: { onSubmit: (file: File) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(file);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Upload failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form className="mt-4" onSubmit={handleSubmit}>
      <label
        htmlFor="answers"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center ${
          file ? "border-indigo-300 bg-indigo-50/50" : "border-slate-300 hover:bg-slate-50"
        }`}
      >
        <span className="text-sm font-medium">{file ? file.name : "Choose your answers PDF"}</span>
        <span className="mt-0.5 text-xs text-slate-500">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
            : "One typed PDF with all answers, labelled Q1, Q2… · up to 20 MB"}
        </span>
        <input
          id="answers"
          ref={input}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError("");
          }}
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={primaryButton} type="submit" disabled={!file || busy}>
          {busy ? "Submitting…" : "Submit answers"}
        </button>
        <p className="text-xs text-slate-500">You can submit only once.</p>
        {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
      </div>
    </form>
  );
}
