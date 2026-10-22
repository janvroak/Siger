"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { AssignmentForm } from "@/components/AssignmentForm";
import { ApiError, getAssignmentKey, updateAssignment, type Assignment } from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function EditAssignmentPage() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const router = useRouter();
  const { token, user, error: authError } = useAuthedUser();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [pageError, setPageError] = useState("");
  const viewUrl = `/courses/${courseId}/assignments/${assignmentId}`;

  useEffect(() => {
    if (!token) {
      return;
    }
    getAssignmentKey(token, courseId, assignmentId)
      .then(setAssignment)
      .catch((caught: unknown) =>
        setPageError(
          caught instanceof ApiError && caught.status === 403
            ? "Only the course professor can edit this assignment."
            : caught instanceof ApiError && caught.status === 404
              ? "This assignment does not exist."
              : "Unable to load the assignment.",
        ),
      );
  }, [token, courseId, assignmentId]);

  const error = authError || pageError;

  return (
    <AppShell user={user} token={token}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!assignment && !error ? <PageMessage>Loading assignment…</PageMessage> : null}

      {assignment && token ? (
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href={viewUrl}>
            ← {assignment.title}
          </Link>
          <h1 className="mt-4 mb-6 text-2xl font-semibold">Edit assignment</h1>
          <AssignmentForm
            initial={assignment}
            submitLabel="Save changes"
            onCancel={() => router.push(viewUrl)}
            onSubmit={async (input) => {
              await updateAssignment(token, courseId, assignmentId, input);
              router.push(viewUrl);
            }}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
