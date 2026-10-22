"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { ClassDashboard } from "@/components/ClassDashboard";
import { InsightPanel } from "@/components/InsightPanel";
import { StudentDashboard } from "@/components/StudentDashboard";
import {
  ApiError,
  getCourse,
  getCourseAnalytics,
  getMyProgress,
  type Course,
  type CourseAnalytics,
  type StudentProgress,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function AnalyticsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { token, user, error: authError } = useAuthedUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    if (!token || !user) {
      return;
    }
    const data =
      user.role === "professor"
        ? getCourseAnalytics(token, courseId).then(setAnalytics)
        : getMyProgress(token, courseId).then(setProgress);
    Promise.all([getCourse(token, courseId).then(setCourse), data]).catch((caught: unknown) =>
      setPageError(
        caught instanceof ApiError && caught.status === 403
          ? "You don't have access to this course."
          : "Unable to load analytics.",
      ),
    );
  }, [token, user, courseId]);

  const error = authError || pageError;
  const ready = course && (analytics || progress);

  return (
    <AppShell user={user} token={token}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!ready && !error ? <PageMessage>Loading analytics…</PageMessage> : null}

      {ready ? (
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href={`/courses/${courseId}`}>
            ← {course.code} · {course.title}
          </Link>
          <h1 className="mt-3 mb-6 text-2xl font-semibold">
            {analytics ? "Class analytics" : "My progress"}
          </h1>
          {token ? (
            <div className="mb-6">
              <InsightPanel
                token={token}
                courseId={courseId}
                suggestions={
                  analytics
                    ? [
                        "Which topics should I revise in class?",
                        "Who is falling behind?",
                        "How reliable has the AI grading been?",
                      ]
                    : ["What should I study next?", "Am I improving?"]
                }
              />
            </div>
          ) : null}
          {analytics ? <ClassDashboard analytics={analytics} courseId={courseId} /> : null}
          {progress ? <StudentDashboard progress={progress} courseId={courseId} viewer="student" /> : null}
        </div>
      ) : null}
    </AppShell>
  );
}
