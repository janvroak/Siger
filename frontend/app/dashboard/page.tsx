"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { clearToken } from "@/lib/auth";
import { getEnrolledCourses, getMyCourses, type Course } from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function DashboardPage() {
  const router = useRouter();
  const { token, user, error } = useAuthedUser();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [coursesError, setCoursesError] = useState("");

  useEffect(() => {
    if (!token || !user || user.role === "admin") {
      return;
    }
    const load = user.role === "student" ? getEnrolledCourses : getMyCourses;
    load(token)
      .then(setCourses)
      .catch(() => setCoursesError("Unable to load your courses."));
  }, [token, user]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold">Siger</h1>
        <button className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={logout}>
          Log out
        </button>
      </div>
      {error ? <p className="mt-6 text-red-700">{error}</p> : null}
      {!user && !error ? <p className="mt-6 text-slate-600">Loading your account...</p> : null}
      {user ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-2xl font-semibold">Welcome {user.full_name}</h2>
          <p><span className="font-medium">Email:</span> {user.email}</p>
          <p><span className="font-medium">Role:</span> {user.role}</p>
        </section>
      ) : null}
      {user && user.role !== "admin" ? (
        <section className="mt-10">
          <h3 className="text-lg font-semibold">
            {user.role === "student" ? "Your courses" : "Courses you teach"}
          </h3>
          {coursesError ? <p className="mt-3 text-sm text-red-700">{coursesError}</p> : null}
          {!courses && !coursesError ? (
            <p className="mt-3 text-sm text-slate-600">Loading courses...</p>
          ) : null}
          {courses && courses.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              {user.role === "student"
                ? "You are not enrolled in any courses yet."
                : "You have not created any courses yet."}
            </p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {courses?.map((course) => (
              <li
                key={course.id}
                className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {course.code} · {course.semester}
                  </p>
                  <p className="font-medium">{course.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.description}</p>
                </div>
                <Link
                  className="shrink-0 rounded bg-slate-900 px-3 py-2 text-sm text-white"
                  href={
                    user.role === "student"
                      ? `/courses/${course.id}/chat`
                      : `/courses/${course.id}/materials`
                  }
                >
                  {user.role === "student" ? "Ask SIGER" : "Course material"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
