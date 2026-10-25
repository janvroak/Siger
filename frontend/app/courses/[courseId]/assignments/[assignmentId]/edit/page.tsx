"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { AssignmentForm } from "@/components/AssignmentForm";
import { Page, PageHeader } from "@/components/ui/Card";
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
        <Page className="pb-0 lg:pb-0">
          <PageHeader
            back={{ href: viewUrl, label: assignment.title }}
            title="Edit assignment"
            description="Changes apply to the answer key used for grading. Editing is locked once students submit."
          />
          <AssignmentForm
            initial={assignment}
            submitLabel="Save changes"
            onCancel={() => router.push(viewUrl)}
            onSubmit={async (input) => {
              await updateAssignment(token, courseId, assignmentId, input);
              router.push(viewUrl);
            }}
          />
        </Page>
      ) : null}
    </AppShell>
  );
}
