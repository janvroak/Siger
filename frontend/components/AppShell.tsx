"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { getEnrolledCourses, getMyCourses, type Course, type User } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { courseAccent } from "@/components/CourseCard";

type AppShellProps = {
  user: User | null;
  token: string | null;
  children: ReactNode;
  /** Bump to refetch the sidebar course list after creating or joining a course. */
  coursesVersion?: number;
  /** Let the page fill the viewport and manage its own scrolling (chat). */
  fullHeight?: boolean;
};

export function AppShell({ user, token, children, coursesVersion = 0, fullHeight }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    if (!token || !user || user.role === "admin") {
      return;
    }
    const load = user.role === "student" ? getEnrolledCourses : getMyCourses;
    load(token)
      .then(setCourses)
      .catch(() => setCourses([]));
  }, [token, user, coursesVersion]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  const initials = user?.full_name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5">
          <Logo />
          <div>
            <p className="text-base font-semibold tracking-tight">SIGER</p>
            <p className="text-xs text-slate-500">AI Teaching Assistant</p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-2 text-sm">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            <DashboardIcon />
            Dashboard
          </NavLink>

          {courses.length > 0 ? (
            <>
              <p className="mt-6 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                {user?.role === "professor" ? "Courses you teach" : "My courses"}
              </p>
              {courses.map((course) => (
                <NavLink
                  key={course.id}
                  href={`/courses/${course.id}`}
                  active={pathname.startsWith(`/courses/${course.id}`)}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${courseAccent(course.code).soft}`}
                  >
                    {course.code.slice(0, 2)}
                  </span>
                  <span className="truncate">
                    <span className="font-medium">{course.code}</span>{" "}
                    <span className="text-slate-500">{course.title}</span>
                  </span>
                </NavLink>
              ))}
            </>
          ) : null}
        </nav>

        {user ? (
          <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.full_name}</p>
              <p className="text-xs capitalize text-slate-500">{user.role}</p>
            </div>
            <button
              className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo />
            <span className="font-semibold">SIGER</span>
          </Link>
          <button className="text-sm text-slate-600" onClick={logout}>
            Log out
          </button>
        </header>
        <main className={fullHeight ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto"}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </Link>
  );
}

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-sm">
      S
    </span>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  );
}

/** Loading / error placeholder shown inside the shell. */
export function PageMessage({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <p
        className={
          tone === "error"
            ? "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            : "text-sm text-slate-500"
        }
      >
        {children}
      </p>
    </div>
  );
}
