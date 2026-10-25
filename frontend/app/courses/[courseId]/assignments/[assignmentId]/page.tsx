"use client";

import { Lock, Pencil, Trash2, EyeOff, Hash } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { DeadlineBadge, formatDeadline } from "@/components/AssignmentList";
import { plural } from "@/components/CourseCard";
import { Modal } from "@/components/Modal";
import { Tag } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, Page, PageHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/States";
import { RosterPanel } from "@/components/RosterPanel";
import { SubmissionPanel } from "@/components/SubmissionPanel";
import {
  ApiError,
  deleteAssignment,
  getAssignment,
  getAssignmentKey,
  getRoster,
  type Assignment,
  type Question,
  type StudentAssignment,
  type StudentQuestion,
  type SubmissionRoster,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function AssignmentPage() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const router = useRouter();
  const { token, user, error: authError } = useAuthedUser();
  const [assignment, setAssignment] = useState<Assignment | StudentAssignment | null>(null);
  const [pageError, setPageError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [roster, setRoster] = useState<SubmissionRoster | null>(null);
  const isProfessor = user?.role === "professor";

  const loadRoster = useCallback(
    (activeToken: string) =>
      getRoster(activeToken, courseId, assignmentId)
        .then(setRoster)
        .catch(() => setRoster(null)),
    [courseId, assignmentId],
  );

  useEffect(() => {
    if (token && isProfessor) {
      void loadRoster(token);
    }
  }, [token, isProfessor, loadRoster]);

  // Keep the roster current while the evaluation agent is still grading.
  const grading = roster?.students.some(
    (row) => row.state === "submitted" || row.state === "evaluating",
  );
  useEffect(() => {
    if (!token || !grading) {
      return;
    }
    const timer = setInterval(() => void loadRoster(token), 10_000);
    return () => clearInterval(timer);
  }, [token, grading, loadRoster]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }
    // Professors load the answer key; students can only reach the question-only view.
    const load = user.role === "professor" ? getAssignmentKey : getAssignment;
    load(token, courseId, assignmentId)
      .then(setAssignment)
      .catch((caught: unknown) =>
        setPageError(
          caught instanceof ApiError && caught.status === 404
            ? "This assignment does not exist."
            : caught instanceof ApiError && caught.status === 403
              ? "You don't have access to this course."
              : "Unable to load the assignment.",
        ),
      );
  }, [token, user, courseId, assignmentId]);

  const error = authError || pageError;
  const totalMarks = assignment?.questions.reduce((sum, question) => sum + question.max_marks, 0) ?? 0;
  // The answer key can't change once students have been graded against it.
  const locked = (roster?.submitted ?? 0) > 0;
  const keyNotIndexed = assignment && "answer_keys_indexed" in assignment && !assignment.answer_keys_indexed;

  return (
    <AppShell user={user} token={token}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!assignment && !error ? <PageMessage>Loading assignment…</PageMessage> : null}

      {assignment && token ? (
        <Page>
          <PageHeader
            back={{ href: `/courses/${courseId}`, label: "Back to course" }}
            eyebrow={<DeadlineBadge deadline={assignment.deadline} />}
            title={assignment.title}
            description={`Due ${formatDeadline(assignment.deadline)} · ${plural(assignment.questions.length, "question")} · ${plural(totalMarks, "mark")}`}
            actions={
              isProfessor ? (
                <>
                  {locked ? (
                    <span
                      className={buttonClass("secondary")}
                      aria-disabled="true"
                      title="Students have submitted, so the answer key is locked"
                    >
                      <Lock size={15} aria-hidden />
                      Edit locked
                    </span>
                  ) : (
                    <Link className={buttonClass("secondary")} href={`/courses/${courseId}/assignments/${assignmentId}/edit`}>
                      <Pencil size={15} aria-hidden />
                      Edit
                    </Link>
                  )}
                  <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                </>
              ) : null
            }
          />

          {assignment.instructions ? (
            <Card className="bg-surface-2/60 shadow-none">
              <p className="text-xs font-semibold text-muted">Instructions</p>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-fg">{assignment.instructions}</p>
            </Card>
          ) : null}
          {keyNotIndexed ? (
            <Callout tone="warning" className="mt-4">
              The answer key is saved but not yet indexed for similarity checks (the embedding service was
              unavailable). It will be indexed automatically when grading starts.
            </Callout>
          ) : null}

          {isProfessor ? (
            roster ? (
              <RosterPanel
                token={token}
                courseId={courseId}
                assignmentId={assignmentId}
                roster={roster}
                onRefresh={() => void loadRoster(token)}
              />
            ) : null
          ) : (
            <SubmissionPanel
              token={token}
              courseId={courseId}
              assignmentId={assignmentId}
              deadline={assignment.deadline}
            />
          )}

          <h2 className="mt-10 mb-3 flex items-center gap-2 text-base font-semibold text-fg">
            Questions
            <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-sans text-xs font-medium text-muted tabular-nums">
              {assignment.questions.length}
            </span>
          </h2>
          <ol className="space-y-3">
            {assignment.questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </ol>
        </Page>
      ) : null}

      {confirmDelete && assignment && token ? (
        <DeleteDialog
          title={assignment.title}
          submissions={roster?.submitted ?? 0}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteAssignment(token, courseId, assignmentId);
            router.push(`/courses/${courseId}`);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function QuestionCard({ question }: { question: Question | StudentQuestion }) {
  const key = "model_answer" in question ? question : null;
  return (
    <Card as="li" className="p-5 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-surface-2 px-1.5 font-display text-xs font-bold text-fg">
            Q{question.position}
          </span>
          <Tag>{question.topic}</Tag>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted tabular-nums">
          <Hash size={12} aria-hidden />
          {plural(question.max_marks, "mark")}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">{question.text}</p>

      {key ? (
        <div className="mt-4 rounded-lg border border-warning-line bg-warning-soft/60 p-4 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <EyeOff size={13} aria-hidden />
            Answer key · hidden from students
          </p>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap text-fg">{key.model_answer}</p>
          {key.key_points.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {key.key_points.map((point) => (
                <li key={point} className="rounded-md border border-warning-line bg-surface px-2 py-1 text-xs text-fg">
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function DeleteDialog({
  title,
  submissions,
  onClose,
  onConfirm,
}: {
  title: string;
  submissions: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Delete assignment?"
      description={
        submissions > 0
          ? `“${title}”, its answer key and ${plural(submissions, "student submission")} will be permanently deleted.`
          : `“${title}” and its answer key will be permanently deleted.`
      }
      onClose={onClose}
    >
      {error ? <Callout tone="danger" className="mb-4">{error}</Callout> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="danger"
          icon={Trash2}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Could not delete.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}
