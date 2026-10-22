"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { CourseCard, plural } from "@/components/CourseCard";
import { Modal, inputClass, primaryButton, secondaryButton } from "@/components/Modal";
import {
  ApiError,
  createCourse,
  enrollInCourse,
  getAvailableCourses,
  getEnrolledCourses,
  getMyCourses,
  joinCourseByCode,
  type Course,
  type User,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function DashboardPage() {
  const { token, user, error } = useAuthedUser();
  const [coursesVersion, setCoursesVersion] = useState(0);
  const refresh = useCallback(() => setCoursesVersion((version) => version + 1), []);

  return (
    <AppShell user={user} token={token} coursesVersion={coursesVersion}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!user && !error ? <PageMessage>Loading your dashboard…</PageMessage> : null}
      {user && token && user.role === "student" ? (
        <StudentDashboard user={user} token={token} version={coursesVersion} onChange={refresh} />
      ) : null}
      {user && token && user.role === "professor" ? (
        <ProfessorDashboard user={user} token={token} version={coursesVersion} onChange={refresh} />
      ) : null}
      {user?.role === "admin" ? (
        <PageMessage>Admin tools are not part of this release.</PageMessage>
      ) : null}
    </AppShell>
  );
}

type DashboardProps = {
  user: User;
  token: string;
  version: number;
  onChange: () => void;
};

function StudentDashboard({ user, token, version, onChange }: DashboardProps) {
  const [enrolled, setEnrolled] = useState<Course[] | null>(null);
  const [available, setAvailable] = useState<Course[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([getEnrolledCourses(token), getAvailableCourses(token)])
      .then(([mine, all]) => {
        const mineIds = new Set(mine.map((course) => course.id));
        setEnrolled(mine);
        setAvailable(all.filter((course) => !mineIds.has(course.id)));
      })
      .catch(() => setLoadError("Unable to load your courses."));
  }, [token, version]);

  async function join(course: Course) {
    setJoiningId(course.id);
    setNotice("");
    try {
      await enrollInCourse(token, course.id);
      setNotice(`You joined ${course.code} — ${course.title}.`);
      onChange();
    } catch (caughtError) {
      setNotice(caughtError instanceof ApiError ? caughtError.message : "Unable to join the course.");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <Welcome
        user={user}
        subtitle="Ask questions about your courses and get answers grounded in your course material."
        action={
          <button className={primaryButton} onClick={() => setJoinOpen(true)}>
            + Join Course
          </button>
        }
      />
      {notice ? <Notice>{notice}</Notice> : null}
      {loadError ? <p className="mt-6 text-sm text-red-700">{loadError}</p> : null}

      <Section title="My Courses" count={enrolled?.length}>
        {enrolled === null && !loadError ? <Skeleton /> : null}
        {enrolled?.length === 0 ? (
          <EmptyState
            title="You haven't joined any courses yet"
            body="Join a course with the code your professor shared, or pick one from Available Courses below."
          />
        ) : null}
        <Grid>
          {enrolled?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              meta={[
                course.material_count > 0
                  ? `${plural(course.material_count, "document")} available`
                  : "No course material yet",
              ]}
              actions={
                <>
                  <Link className={primaryButton} href={`/courses/${course.id}`}>
                    Open Course
                  </Link>
                  <Link className={secondaryButton} href={`/courses/${course.id}/chat`}>
                    Ask AI Assistant
                  </Link>
                </>
              }
            />
          ))}
        </Grid>
      </Section>

      <Section title="Available Courses" count={available?.length}>
        {available?.length === 0 ? (
          <EmptyState title="No other courses right now" body="New courses will appear here." />
        ) : null}
        <Grid>
          {available?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              meta={[plural(course.student_count, "student")]}
              actions={
                <button
                  className={primaryButton}
                  onClick={() => void join(course)}
                  disabled={joiningId !== null}
                >
                  {joiningId === course.id ? "Joining…" : "Join"}
                </button>
              }
            />
          ))}
        </Grid>
      </Section>

      {joinOpen ? (
        <JoinCourseDialog
          token={token}
          onClose={() => setJoinOpen(false)}
          onJoined={(course) => {
            setJoinOpen(false);
            setNotice(`You joined ${course.code} — ${course.title}.`);
            onChange();
          }}
        />
      ) : null}
    </div>
  );
}

function ProfessorDashboard({ user, token, version, onChange }: DashboardProps) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<Course | null>(null);

  useEffect(() => {
    getMyCourses(token)
      .then(setCourses)
      .catch(() => setLoadError("Unable to load your courses."));
  }, [token, version]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <Welcome
        user={user}
        subtitle="Create courses and upload material. Students get an AI assistant that answers only from it."
        action={
          <button className={primaryButton} onClick={() => setCreateOpen(true)}>
            + Create Course
          </button>
        }
      />
      {created ? (
        <Notice>
          {created.code} — {created.title} was created. Share the code{" "}
          <span className="font-semibold">{created.code}</span> with students, then{" "}
          <Link className="font-medium underline" href={`/courses/${created.id}#upload`}>
            upload course material
          </Link>
          .
        </Notice>
      ) : null}
      {loadError ? <p className="mt-6 text-sm text-red-700">{loadError}</p> : null}

      <Section title="My Courses" count={courses?.length}>
        {courses === null && !loadError ? <Skeleton /> : null}
        {courses?.length === 0 ? (
          <EmptyState
            title="You haven't created any courses yet"
            body="Create your first course, then upload PDF material so students can ask questions about it."
          />
        ) : null}
        <Grid>
          {courses?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              meta={[
                plural(course.student_count, "student"),
                course.material_count > 0
                  ? plural(course.material_count, "document")
                  : "No material yet",
              ]}
              actions={
                <>
                  <Link className={primaryButton} href={`/courses/${course.id}`}>
                    Manage Course
                  </Link>
                  <Link className={secondaryButton} href={`/courses/${course.id}#upload`}>
                    Upload Material
                  </Link>
                </>
              }
            />
          ))}
        </Grid>
      </Section>

      {createOpen ? (
        <CreateCourseDialog
          token={token}
          onClose={() => setCreateOpen(false)}
          onCreated={(course) => {
            setCreateOpen(false);
            setCreated(course);
            onChange();
          }}
        />
      ) : null}
    </div>
  );
}

function JoinCourseDialog({
  token,
  onClose,
  onJoined,
}: {
  token: string;
  onClose: () => void;
  onJoined: (course: Course) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      onJoined(await joinCourseByCode(token, code.trim()));
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to join the course.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title="Join a course"
      description="Enter the course code your professor shared with you."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">
          Course code
          <input
            className={`${inputClass} uppercase`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. DB201"
            maxLength={50}
            autoFocus
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <DialogButtons
          onCancel={onClose}
          submitLabel={isSubmitting ? "Joining…" : "Join Course"}
          disabled={isSubmitting || !code.trim()}
        />
      </form>
    </Modal>
  );
}

function CreateCourseDialog({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (course: Course) => void;
}) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [semester, setSemester] = useState(currentTerm);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      onCreated(await createCourse(token, { title, code, description, semester }));
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create the course.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title="Create a course"
      description="Students join with the course code, so keep it short and unique."
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">
          Course name
          <input
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Database Systems"
            maxLength={255}
            autoFocus
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Course code
            <input
              className={`${inputClass} uppercase`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. DB201"
              maxLength={50}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Semester
            <input
              className={inputClass}
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
              maxLength={100}
              required
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Short description
          <textarea
            className={`${inputClass} min-h-24`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What the course covers. The AI assistant uses this to recognise off-topic questions."
            maxLength={5000}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <DialogButtons
          onCancel={onClose}
          submitLabel={isSubmitting ? "Creating…" : "Create Course"}
          disabled={isSubmitting}
        />
      </form>
    </Modal>
  );
}

function DialogButtons({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  submitLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className={secondaryButton} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={primaryButton} disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  );
}

function Welcome({ user, subtitle, action }: { user: User; subtitle: string; action: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-indigo-100">{user.role === "professor" ? "Faculty portal" : "Student portal"}</p>
        <h1 className="mt-1 text-2xl font-semibold">Welcome back, {user.full_name.split(" ")[0]}</h1>
        <p className="mt-1 max-w-xl text-sm text-indigo-100">{subtitle}</p>
      </div>
      <div className="[&>button]:bg-white [&>button]:text-indigo-700 [&>button:hover]:bg-indigo-50">
        {action}
      </div>
    </section>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        {count !== undefined ? (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
            {count}
          </span>
        ) : null}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {children}
    </p>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />
      ))}
    </div>
  );
}

function currentTerm(): string {
  const now = new Date();
  const month = now.getMonth();
  const term = month >= 7 ? "Fall" : month >= 5 ? "Summer" : "Spring";
  return `${term} ${now.getFullYear()}`;
}
