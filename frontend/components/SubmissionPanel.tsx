"use client";

import { CalendarX2, FileText, Info, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { deadlineLabel } from "@/components/AssignmentList";
import { GradeView } from "@/components/GradeView";
import { plural } from "@/components/CourseCard";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { StatusBadge } from "@/components/SubmissionStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dropzone } from "@/components/ui/Dropzone";
import { ProgressBar } from "@/components/ui/Metrics";
import { Callout, EmptyState, Skeleton } from "@/components/ui/States";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { useToast } from "@/components/ui/Toast";
import {
  ApiError,
  getMySubmission,
  getMySubmissionPdf,
  submitAssignment,
  type Submission,
} from "@/lib/api";

const POLL_MS = 15_000;

const STEPS = [
  { label: "Submitted", description: "PDF received" },
  { label: "AI evaluating", description: "Graded against the key" },
  { label: "Faculty review", description: "Your professor checks it" },
  { label: "Published", description: "Grade visible to you" },
];

/** Students never see a failed grading run; it shows as still being evaluated. */
function currentStep(submission: Submission): number {
  switch (submission.status) {
    case "submitted":
    case "evaluating":
    case "failed":
      return 1;
    case "under_review":
      return 2;
    case "published":
      return 4;
  }
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
    <Card className="mt-6">
      <CardHeader
        title="Your submission"
        action={
          submission !== undefined ? (
            <StatusBadge audience="student" state={submission?.status ?? (closed ? "overdue" : "not_submitted")} />
          ) : null
        }
      />

      {loadError ? <Callout tone="danger" className="mt-4">{loadError}</Callout> : null}
      {submission === undefined && !loadError ? <Skeleton className="mt-5 h-28" /> : null}

      {submission ? (
        <>
          <div className="mt-6 rounded-xl border border-line bg-surface-2/50 px-2 py-5 sm:px-4">
            <StatusStepper
              steps={STEPS}
              current={currentStep(submission)}
              complete={submission.status === "published"}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <FileText size={17} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium text-fg">{submission.filename}</p>
              <p className="text-xs text-muted">
                {plural(submission.page_count, "page")} · submitted {new Date(submission.submitted_at).toLocaleString()}
              </p>
            </div>
            <OpenPdfButton load={() => getMySubmissionPdf(token, courseId, assignmentId)} />
          </div>
          {submission.status === "published" ? (
            <GradeView token={token} courseId={courseId} assignmentId={assignmentId} />
          ) : (
            <Callout tone="info" icon={Info} className="mt-4">
              Your answers are graded by the AI and then checked by your professor. Your grade appears here once it is
              published. This page checks for updates automatically.
            </Callout>
          )}
        </>
      ) : null}

      {submission === null && closed ? (
        <EmptyState
          compact
          className="mt-5"
          icon={CalendarX2}
          title="The deadline has passed"
          body="No submission was made for this assignment."
        />
      ) : null}

      {submission === null && !closed ? (
        <UploadForm
          onSubmit={async (file) => {
            setSubmission(await submitAssignment(token, courseId, assignmentId, file));
          }}
        />
      ) : null}
    </Card>
  );
}

function UploadForm({ onSubmit }: { onSubmit: (file: File) => Promise<void> }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(file);
      toast.success("Answers submitted", "The AI is grading them now.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Upload failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form className="mt-5" onSubmit={handleSubmit}>
      <Dropzone
        id="answers"
        file={file}
        disabled={busy}
        title="Drop your answers PDF here"
        hint="one typed PDF, answers labelled Q1, Q2… · up to 20 MB"
        onFile={(next) => {
          setFile(next);
          setError("");
        }}
      />
      {busy ? <ProgressBar label="Uploading" className="mt-3" /> : null}
      {error ? <Callout tone="danger" className="mt-3">{error}</Callout> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" icon={Send} disabled={!file} loading={busy}>
          {busy ? "Submitting…" : "Submit answers"}
        </Button>
        <p className="text-xs text-muted">You can submit only once.</p>
      </div>
    </form>
  );
}
