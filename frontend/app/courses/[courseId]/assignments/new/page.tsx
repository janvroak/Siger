"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AppShell, PageMessage } from "@/components/AppShell";
import { AssignmentForm } from "@/components/AssignmentForm";
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
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href={`/courses/${courseId}`}>
            ← Course
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">New assignment</h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            Write each question with the answer you would give full marks to. Submissions are graded
            against this answer key.
          </p>
          <AssignmentForm
            submitLabel="Create assignment"
            onCancel={() => router.push(`/courses/${courseId}`)}
            onSubmit={async (input) => {
              const created = await createAssignment(token, courseId, input);
              router.push(`/courses/${courseId}/assignments/${created.id}`);
            }}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
