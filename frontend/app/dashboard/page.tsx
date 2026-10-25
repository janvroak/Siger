"use client";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Inbox,
  LibraryBig,
  MessageSquareText,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { deadlineLabel, formatDeadline } from "@/components/AssignmentList";
import { TrendChart } from "@/components/charts/TrendChart";
import { CourseCard, plural } from "@/components/CourseCard";
import { Modal } from "@/components/Modal";
import { Badge, Tag } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardHeader, Page, PageHeader, Section } from "@/components/ui/Card";
import { Field, inputClass } from "@/components/ui/Field";
import { ScoreChip, StatCard } from "@/components/ui/Metrics";
import { Callout, EmptyState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import {
  ApiError,
  createCourse,
  enrollInCourse,
  getAvailableCourses,
  getEnrolledCourses,
  getMyCourses,
  joinCourseByCode,
  listAssignments,
  type AssignmentSummary,
  type Course,
  type User,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

export default function DashboardPage() {
  const { token, user, error } = useAuthedUser();
  const [coursesVersion, setCoursesVersion] = useState(0);
  const refresh = useCallback(() => setCoursesVersion((version) => version + 1), []);

  return (
    <AppShell user={user} token={token} coursesVersion={coursesVersion} title="Dashboard">
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!user && !error ? <PageMessage>Loading your dashboard…</PageMessage> : null}
      {user && token && user.role === "student" ? (
        <StudentDashboard user={user} token={token} version={coursesVersion} onChange={refresh} />
      ) : null}
      {user && token && user.role === "professor" ? (
        <ProfessorDashboard user={user} token={token} version={coursesVersion} onChange={refresh} />
      ) : null}
      {user?.role === "admin" ? (
        <Page>
          <EmptyState icon={Inbox} title="Admin tools are not part of this release." />
        </Page>
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

type CourseAssignment = AssignmentSummary & { course: Course };

/** Every assignment across the given courses, read from each course's assignment list. */
function useCourseAssignments(token: string, courses: Course[] | null) {
  const [items, setItems] = useState<CourseAssignment[] | null>(null);
  useEffect(() => {
    if (!courses) return;
    let cancelled = false;
    Promise.allSettled(courses.map((course) => listAssignments(token, course.id))).then((results) => {
      if (cancelled) return;
      setItems(
        results.flatMap((result, i) =>
          result.status === "fulfilled" ? result.value.map((a) => ({ ...a, course: courses[i] })) : [],
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [token, courses]);
  return items;
}

/** First name for the greeting, skipping titles like "Dr." or "Prof.". */
function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const named = parts.find((part) => !/^(dr|prof|mr|mrs|ms|mx)\.?$/i.test(part));
  return named ?? parts[0] ?? "";
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function StudentDashboard({ user, token, version, onChange }: DashboardProps) {
  const toast = useToast();
  const [enrolled, setEnrolled] = useState<Course[] | null>(null);
  const [available, setAvailable] = useState<Course[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getEnrolledCourses(token), getAvailableCourses(token)])
      .then(([mine, all]) => {
        const mineIds = new Set(mine.map((course) => course.id));
        setEnrolled(mine);
        setAvailable(all.filter((course) => !mineIds.has(course.id)));
      })
      .catch(() => setLoadError("Unable to load your courses."));
  }, [token, version]);

  const assignments = useCourseAssignments(token, enrolled);

  async function join(course: Course) {
    setJoiningId(course.id);
    try {
      await enrollInCourse(token, course.id);
      toast.success(`You joined ${course.code}`, course.title);
      onChange();
    } catch (caughtError) {
      toast.error("Could not join the course", caughtError instanceof ApiError ? caughtError.message : undefined);
    } finally {
      setJoiningId(null);
    }
  }

  const stats = useMemo(() => {
    if (!assignments) return null;
    const open = assignments.filter((a) => a.my_status === null && !deadlineLabel(a.deadline).closed);
    const missed = assignments.filter((a) => a.my_status === null && deadlineLabel(a.deadline).closed);
    const submitted = assignments.filter((a) => a.my_status !== null);
    const graded = assignments
      .filter((a) => a.my_score !== null && a.total_marks > 0)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
    const average = graded.length
      ? graded.reduce((sum, a) => sum + a.my_score! / a.total_marks, 0) / graded.length
      : null;
    const upcoming = [...open, ...missed.slice(-3)].sort((a, b) => a.deadline.localeCompare(b.deadline));
    return { open, missed, submitted, graded, average, upcoming };
  }, [assignments]);

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={<Badge tone="info" icon={GraduationCap}>Student</Badge>}
        title={`${greeting()}, ${firstName(user.full_name)}`}
        description="Your deadlines, grades and courses in one place."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setJoinOpen(true)}>
            Join course
          </Button>
        }
      />
      {loadError ? <Callout tone="danger">{loadError}</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats ? (
          <>
            <StatCard
              icon={Clock}
              tone={stats.open.length ? "warning" : "success"}
              label="Pending"
              value={stats.open.length}
              note={stats.open.length ? "Open assignments to submit" : "Nothing due right now"}
            />
            <StatCard icon={CheckCircle2} label="Submitted" value={stats.submitted.length} note={`${plural(stats.graded.length, "grade")} published`} />
            <StatCard
              emphasis
              icon={Award}
              label="Average score"
              value={stats.average === null ? "—" : `${Math.round(stats.average * 100)}%`}
              note={stats.average === null ? "After your first published grade" : "Across published grades"}
            />
          </>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px]" />)
        )}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card padded={false}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <CardHeader title="Upcoming deadlines" description="Open work first; recently missed deadlines are flagged." />
          </div>
          {!stats ? (
            <div className="space-y-2 px-6 pb-6">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : stats.upcoming.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState compact icon={CalendarClock} title="You're all caught up" body="No open assignments right now." />
            </div>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {stats.upcoming.slice(0, 6).map((a) => (
                <DeadlineRow key={a.id} assignment={a} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent grades" description="Published by your professors" />
          {!stats ? (
            <Skeleton className="mt-4 h-40" />
          ) : stats.graded.length === 0 ? (
            <EmptyState compact className="mt-4" icon={Award} title="No grades yet" body="Grades appear here once your professor publishes them." />
          ) : (
            <>
              <div className="mt-3 -mx-1">
                <TrendChart
                  compact
                  height={90}
                  items={stats.graded.map((a) => ({
                    assignment_id: a.id,
                    title: a.title,
                    deadline: a.deadline,
                    earned: a.my_score!,
                    possible: a.total_marks,
                    score: a.my_score! / a.total_marks,
                  }))}
                />
              </div>
              <ul className="mt-3 space-y-1">
                {[...stats.graded].reverse().slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/courses/${a.course.id}/assignments/${a.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{a.title}</p>
                        <p className="text-xs text-muted">{a.course.code}</p>
                      </div>
                      <ScoreChip value={a.my_score!} max={a.total_marks} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Section className="mt-10" title="My courses" count={enrolled?.length}>
        {enrolled === null && !loadError ? <CourseSkeleton /> : null}
        {enrolled?.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="You haven't joined any courses yet"
            body="Join a course with the code your professor shared, or pick one from Available courses below."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setJoinOpen(true)}>
                Join course
              </Button>
            }
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
                  <Link className={buttonClass("primary", "sm")} href={`/courses/${course.id}`}>
                    Open course
                  </Link>
                  <Link className={buttonClass("ghost", "sm")} href={`/courses/${course.id}/chat`}>
                    <MessageSquareText size={14} aria-hidden />
                    Ask assistant
                  </Link>
                </>
              }
            />
          ))}
        </Grid>
      </Section>

      <Section title="Available courses" count={available?.length}>
        {available?.length === 0 ? (
          <EmptyState compact icon={LibraryBig} title="No other courses right now" body="New courses will appear here." />
        ) : null}
        <Grid>
          {available?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              meta={[plural(course.student_count, "student")]}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Plus}
                  onClick={() => void join(course)}
                  disabled={joiningId !== null}
                  loading={joiningId === course.id}
                >
                  {joiningId === course.id ? "Joining…" : "Join"}
                </Button>
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
            toast.success(`You joined ${course.code}`, course.title);
            onChange();
          }}
        />
      ) : null}
    </Page>
  );
}

function DeadlineRow({ assignment }: { assignment: CourseAssignment }) {
  const { text, closed, soon } = deadlineLabel(assignment.deadline);
  return (
    <li>
      <Link
        href={`/courses/${assignment.course.id}/assignments/${assignment.id}`}
        className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:px-6"
      >
        <span
          className={
            closed
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger"
              : soon
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted"
          }
        >
          {closed ? <AlertTriangle size={16} aria-hidden /> : <CalendarClock size={16} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{assignment.title}</p>
          <p className="truncate text-xs text-muted">
            {assignment.course.code} · {formatDeadline(assignment.deadline)}
          </p>
        </div>
        <span
          className={
            closed
              ? "shrink-0 text-xs font-semibold text-danger"
              : soon
                ? "shrink-0 text-xs font-semibold text-warning"
                : "shrink-0 text-xs font-medium text-muted"
          }
        >
          {closed ? "Missed" : text}
        </span>
        <ArrowRight size={15} className="hidden shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
      </Link>
    </li>
  );
}

function ProfessorDashboard({ user, token, version, onChange }: DashboardProps) {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<Course | null>(null);

  useEffect(() => {
    getMyCourses(token)
      .then(setCourses)
      .catch(() => setLoadError("Unable to load your courses."));
  }, [token, version]);

  const assignments = useCourseAssignments(token, courses);
  const upcoming = useMemo(
    () =>
      assignments
        ?.filter((a) => !deadlineLabel(a.deadline).closed)
        .sort((a, b) => a.deadline.localeCompare(b.deadline))
        .slice(0, 5) ?? null,
    [assignments],
  );

  const students = courses?.reduce((sum, c) => sum + c.student_count, 0) ?? 0;
  const documents = courses?.reduce((sum, c) => sum + c.material_count, 0) ?? 0;

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={<Badge tone="accent" icon={GraduationCap}>Faculty</Badge>}
        title={`${greeting()}, ${firstName(user.full_name)}`}
        description="Create courses and assignments, review AI grades, and follow how each class is doing."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
            Create course
          </Button>
        }
      />
      {created ? (
        <Callout
          tone="success"
          className="mb-6"
          title={`${created.code} · ${created.title} was created`}
          action={
            <Link className={buttonClass("secondary", "sm")} href={`/courses/${created.id}#upload`}>
              <Upload size={14} aria-hidden />
              Upload material
            </Link>
          }
        >
          Share the code <span className="font-semibold text-fg">{created.code}</span> with students, then upload course
          material.
        </Callout>
      ) : null}
      {loadError ? <Callout tone="danger">{loadError}</Callout> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {courses ? (
          <>
            <StatCard emphasis icon={LibraryBig} label="Courses" value={courses.length} note="You teach" />
            <StatCard icon={Users} label="Students" value={students} note="Enrolments across courses" />
            <StatCard icon={ClipboardList} label="Assignments" value={assignments?.length ?? "—"} note={upcoming ? `${upcoming.length} still open` : undefined} />
            <StatCard icon={FileText} label="Documents" value={documents} note="Indexed for the assistant" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px]" />)
        )}
      </div>

      <Card padded={false} className="mt-6">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <CardHeader title="Open assignments" description="Closest deadline first, with submissions so far." />
        </div>
        {!upcoming ? (
          <div className="space-y-2 px-6 pb-6">
            {[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState compact icon={CalendarClock} title="No open assignments" body="Create one from a course page." />
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {upcoming.map((a) => {
              const rate = a.course.student_count ? (a.submission_count ?? 0) / a.course.student_count : 0;
              return (
                <li key={a.id}>
                  <Link
                    href={`/courses/${a.course.id}/assignments/${a.id}`}
                    className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:px-6"
                  >
                    <Tag className="hidden sm:inline-flex">{a.course.code}</Tag>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{a.title}</p>
                      <p className="text-xs text-muted">{deadlineLabel(a.deadline).text} · {formatDeadline(a.deadline)}</p>
                    </div>
                    <div className="hidden w-36 shrink-0 sm:block">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Submitted</span>
                        <span className="font-semibold text-fg tabular-nums">
                          {a.submission_count ?? 0}/{a.course.student_count}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]">
                        <div className="h-full rounded-full bg-[var(--viz-series-1)]" style={{ width: `${rate * 100}%` }} />
                      </div>
                    </div>
                    <ArrowRight size={15} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Section className="mt-10" title="My courses" count={courses?.length}>
        {courses === null && !loadError ? <CourseSkeleton /> : null}
        {courses?.length === 0 ? (
          <EmptyState
            icon={LibraryBig}
            title="You haven't created any courses yet"
            body="Create your first course, then upload PDF material so students can ask questions about it."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
                Create course
              </Button>
            }
          />
        ) : null}
        <Grid>
          {courses?.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              meta={[
                plural(course.student_count, "student"),
                course.material_count > 0 ? plural(course.material_count, "document") : "No material yet",
              ]}
              actions={
                <>
                  <Link className={buttonClass("primary", "sm")} href={`/courses/${course.id}`}>
                    Manage course
                  </Link>
                  <Link className={buttonClass("ghost", "sm")} href={`/courses/${course.id}/analytics`}>
                    Analytics
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
            toast.success(`${course.code} created`, "Share the course code with your students.");
            onChange();
          }}
        />
      ) : null}
    </Page>
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
    <Modal title="Join a course" description="Enter the course code your professor shared with you." onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field label="Course code" error={error || undefined}>
          <input
            className={`${inputClass} font-mono tracking-wider uppercase`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. DB201"
            maxLength={50}
            aria-invalid={!!error || undefined}
            autoFocus
            required
          />
        </Field>
        <DialogButtons
          onCancel={onClose}
          submitLabel={isSubmitting ? "Joining…" : "Join course"}
          disabled={isSubmitting || !code.trim()}
          loading={isSubmitting}
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
        <Field label="Course name">
          <input
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Database Systems"
            maxLength={255}
            autoFocus
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Course code">
            <input
              className={`${inputClass} font-mono tracking-wider uppercase`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. DB201"
              maxLength={50}
              required
            />
          </Field>
          <Field label="Semester">
            <input
              className={inputClass}
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
              maxLength={100}
              required
            />
          </Field>
        </div>
        <Field label="Short description" hint="The AI assistant uses this to recognise off-topic questions.">
          <textarea
            className={`${inputClass} min-h-24`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What the course covers."
            maxLength={5000}
            required
          />
        </Field>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <DialogButtons
          onCancel={onClose}
          submitLabel={isSubmitting ? "Creating…" : "Create course"}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </form>
    </Modal>
  );
}

function DialogButtons({
  onCancel,
  submitLabel,
  disabled,
  loading,
}: {
  onCancel: () => void;
  submitLabel: string;
  disabled: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={disabled} loading={loading}>
        {submitLabel}
      </Button>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function CourseSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-60 rounded-xl" />
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
