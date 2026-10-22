"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { DeadlineBadge, formatDeadline } from "@/components/AssignmentList";
import { plural } from "@/components/CourseCard";
import { Modal, primaryButton, secondaryButton } from "@/components/Modal";
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
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href={`/courses/${courseId}`}>
            ← Course
          </Link>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <DeadlineBadge deadline={assignment.deadline} />
                <h1 className="mt-2 text-2xl font-semibold">{assignment.title}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Due {formatDeadline(assignment.deadline)} ·{" "}
                  {plural(assignment.questions.length, "question")} · {plural(totalMarks, "mark")}
                </p>
              </div>
              {isProfessor ? (
                <div className="flex shrink-0 gap-2">
                  {locked ? (
                    <span
                      className={`${secondaryButton} cursor-not-allowed opacity-50`}
                      title="Students have submitted, so the answer key is locked"
                    >
                      Edit
                    </span>
                  ) : (
                    <Link
                      className={secondaryButton}
                      href={`/courses/${courseId}/assignments/${assignmentId}/edit`}
                    >
                      Edit
                    </Link>
                  )}
                  <button
                    className={`${secondaryButton} text-red-700 hover:bg-red-50`}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
            {assignment.instructions ? (
              <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                {assignment.instructions}
              </p>
            ) : null}
            {keyNotIndexed ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                The answer key is saved but not yet indexed for similarity checks (the embedding
                service was unavailable). It will be indexed automatically when grading starts.
              </p>
            ) : null}
          </section>

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

          <h2 className="mt-8 text-lg font-semibold">Questions</h2>
          <ol className="mt-3 space-y-4">
            {assignment.questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </ol>
        </div>
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
    <li className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Q{question.position}</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {question.topic}
          </span>
        </div>
        <span className="text-slate-500">{plural(question.max_marks, "mark")}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap">{question.text}</p>

      {key ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Answer key · hidden from students
          </p>
          <p className="mt-2 whitespace-pre-wrap text-slate-800">{key.model_answer}</p>
          {key.key_points.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
              {key.key_points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
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
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button className={secondaryButton} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={`${primaryButton} bg-red-600 hover:bg-red-700`}
          disabled={busy}
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
        </button>
      </div>
    </Modal>
  );
}
