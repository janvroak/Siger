"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { StudentDashboard } from "@/components/StudentDashboard";
import { ApiError, getStudentProgress, type StudentProgress } from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function StudentProgressPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  const { token, user, error: authError } = useAuthedUser();
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }
    getStudentProgress(token, courseId, studentId)
      .then(setProgress)
      .catch((caught: unknown) =>
        setPageError(
          caught instanceof ApiError && caught.status === 403
            ? "Only the course professor can see a student's progress."
            : caught instanceof ApiError && caught.status === 404
              ? "This student is not enrolled in the course."
              : "Unable to load the student's progress.",
        ),
      );
  }, [token, courseId, studentId]);

  const error = authError || pageError;

  return (
    <AppShell user={user} token={token}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!progress && !error ? <PageMessage>Loading progress…</PageMessage> : null}
      {progress ? (
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href={`/courses/${courseId}/analytics`}>
            ← Class analytics
          </Link>
          <h1 className="mt-3 mb-6 text-2xl font-semibold">{progress.student_name}</h1>
          <StudentDashboard progress={progress} courseId={courseId} viewer="faculty" />
        </div>
      ) : null}
    </AppShell>
  );
}
