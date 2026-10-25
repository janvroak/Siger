"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { InsightPanel } from "@/components/InsightPanel";
import { Avatar } from "@/components/ClassDashboard";
import { Page, PageHeader } from "@/components/ui/Card";
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
        <Page width="wide">
          <PageHeader
            back={{ href: `/courses/${courseId}/analytics`, label: "Class analytics" }}
            title={
              <span className="flex items-center gap-3">
                <Avatar name={progress.student_name} />
                {progress.student_name}
              </span>
            }
            description="Published grades only. Draft and AI-only marks are not counted."
          />
          {token ? (
            <div className="mb-6">
              <InsightPanel
                token={token}
                courseId={courseId}
                studentId={studentId}
                suggestions={["Where does this student need help?", "Is this student improving?"]}
              />
            </div>
          ) : null}
          <StudentDashboard progress={progress} courseId={courseId} viewer="faculty" />
        </Page>
      ) : null}
    </AppShell>
  );
}
