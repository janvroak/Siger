"use client";

import { useParams, useRouter } from "next/navigation";

import { AppShell, PageMessage } from "@/components/AppShell";
import { AssignmentForm } from "@/components/AssignmentForm";
import { Page, PageHeader } from "@/components/ui/Card";
import { createAssignment } from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function NewAssignmentPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { token, user, error } = useAuthedUser();

  return (
    <AppShell user={user} token={token}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {user && user.role !== "professor" ? (
        <PageMessage tone="error">Only the course professor can create assignments.</PageMessage>
      ) : null}

      {user?.role === "professor" && token ? (
        <Page className="pb-0 lg:pb-0">
          <PageHeader
            back={{ href: `/courses/${courseId}`, label: "Back to course" }}
            title="New assignment"
            description="Write each question with the answer you would give full marks to. Submissions are graded against this answer key."
          />
          <AssignmentForm
            submitLabel="Create assignment"
            onCancel={() => router.push(`/courses/${courseId}`)}
            onSubmit={async (input) => {
              const created = await createAssignment(token, courseId, input);
              router.push(`/courses/${courseId}/assignments/${created.id}`);
            }}
          />
        </Page>
      ) : null}
    </AppShell>
  );
}
