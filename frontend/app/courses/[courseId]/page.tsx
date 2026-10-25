"use client";

import {
  BarChart3,
  CheckCircle2,
  Copy,
  FileText,
  Library,
  Loader2,
  MessageSquareText,
  Plus,
  Upload,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { AssignmentList } from "@/components/AssignmentList";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { courseAccent, plural } from "@/components/CourseCard";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button, buttonClass, IconButton } from "@/components/ui/Button";
import { Card, CardHeader, Page, Section } from "@/components/ui/Card";
import { Dropzone } from "@/components/ui/Dropzone";
import { ProgressBar } from "@/components/ui/Metrics";
import { Callout, EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import {
  ApiError,
  getCourse,
  getMaterialPdf,
  listAssignments,
  listMaterials,
  uploadMaterial,
  type AssignmentSummary,
  type Course,
  type Material,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

const STATUS: Record<Material["status"], { label: string; tone: Tone; icon: LucideIcon; pulse?: boolean }> = {
  ready: { label: "Ready", tone: "success", icon: CheckCircle2 },
  processing: { label: "Processing", tone: "info", icon: Loader2, pulse: true },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
};

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { token, user, error: authError } = useAuthedUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentSummary[] | null>(null);
  const [pageError, setPageError] = useState("");
  const [coursesVersion, setCoursesVersion] = useState(0);

  const fetchCourse = useCallback(
    (activeToken: string) =>
      Promise.all([
        getCourse(activeToken, courseId),
        listMaterials(activeToken, courseId),
        listAssignments(activeToken, courseId),
      ]),
    [courseId],
  );

  const reload = useCallback(
    (activeToken: string) =>
      fetchCourse(activeToken)
        .then(([loadedCourse, loadedMaterials, loadedAssignments]) => {
          setCourse(loadedCourse);
          setMaterials(loadedMaterials);
          setAssignments(loadedAssignments);
        })
        .catch((caughtError: unknown) => {
          setPageError(
            caughtError instanceof ApiError && caughtError.status === 404
              ? "This course does not exist."
              : caughtError instanceof ApiError && caughtError.status === 403
                ? "You don't have access to this course. Join it from your dashboard first."
                : "Unable to load this course.",
          );
        }),
    [fetchCourse],
  );

  useEffect(() => {
    if (token) {
      reload(token);
    }
  }, [token, reload]);

  const error = authError || pageError;
  const isProfessor = user?.role === "professor";
  const visibleMaterials = isProfessor
    ? materials
    : materials?.filter((material) => material.status === "ready");
  const readyCount = course?.material_count ?? 0;

  return (
    <AppShell user={user} token={token} coursesVersion={coursesVersion}>
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!course && !error ? <PageMessage>Loading course…</PageMessage> : null}

      {course && user && token ? (
        <Page>
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between lg:p-8">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-12 min-w-12 items-center justify-center rounded-xl px-2 font-display text-sm font-bold ${courseAccent(course.code).soft}`}
                  >
                    {course.code}
                  </span>
                  <div className="text-sm">
                    <p className="font-medium text-fg">{course.professor_name}</p>
                    <p className="text-muted">{course.semester}</p>
                  </div>
                </div>
                <h1 className="mt-5 text-2xl font-bold tracking-tight text-fg sm:text-[28px]">{course.title}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed whitespace-pre-wrap text-muted">{course.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {isProfessor ? (
                    <Badge icon={Users}>{plural(course.student_count, "student")} enrolled</Badge>
                  ) : null}
                  <Badge icon={Library}>{plural(readyCount, "document")} in the knowledge base</Badge>
                  {assignments ? <Badge icon={FileText}>{plural(assignments.length, "assignment")}</Badge> : null}
                </div>
              </div>

              {isProfessor ? (
                <CourseCodeCard course={course} />
              ) : (
                <div className="w-full shrink-0 space-y-2 md:w-72">
                  {readyCount > 0 ? (
                    <Link className={buttonClass("primary", "lg", "w-full")} href={`/courses/${course.id}/chat`}>
                      <MessageSquareText size={16} aria-hidden />
                      Ask the teaching assistant
                    </Link>
                  ) : (
                    <span className={buttonClass("secondary", "lg", "w-full")} aria-disabled="true">
                      <MessageSquareText size={16} aria-hidden />
                      Ask the teaching assistant
                    </span>
                  )}
                  <Link className={buttonClass("secondary", "lg", "w-full")} href={`/courses/${course.id}/analytics`}>
                    <BarChart3 size={16} aria-hidden />
                    My progress
                  </Link>
                  <p className="pt-1 text-center text-xs text-muted">
                    {readyCount > 0
                      ? "Answers come only from this course's material, with sources."
                      : "Available once your professor uploads course material."}
                  </p>
                </div>
              )}
            </div>
          </section>

          <Section
            className="mt-10"
            title="Assignments"
            count={assignments?.length}
            action={
              isProfessor ? (
                <Link className={buttonClass("primary", "sm")} href={`/courses/${course.id}/assignments/new`}>
                  <Plus size={14} aria-hidden />
                  New assignment
                </Link>
              ) : null
            }
          >
            {assignments ? (
              <AssignmentList
                courseId={course.id}
                assignments={assignments}
                audience={isProfessor ? "faculty" : "student"}
                emptyText={
                  isProfessor
                    ? "Create one with questions and a model answer for each. Submissions are graded against it."
                    : "Your professor hasn't posted any assignments yet."
                }
              />
            ) : null}
          </Section>

          {isProfessor ? (
            <UploadPanel
              token={token}
              course={course}
              onUploaded={() => {
                void reload(token);
                setCoursesVersion((version) => version + 1);
              }}
            />
          ) : null}

          <Section title="Course material" count={visibleMaterials?.length}>
            {visibleMaterials && visibleMaterials.length === 0 ? (
              <EmptyState
                icon={Library}
                title="No material yet"
                body={
                  isProfessor
                    ? "Upload a PDF above to enable the AI teaching assistant."
                    : "Your professor hasn't uploaded any material yet."
                }
              />
            ) : null}
            {visibleMaterials && visibleMaterials.length > 0 ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                {visibleMaterials.map((material) => {
                  const status = STATUS[material.status];
                  return (
                    <li key={material.id} className="flex items-start gap-4 px-4 py-4 sm:px-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
                        <FileText size={18} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-fg">{material.filename}</p>
                          <Badge tone={status.tone} icon={status.pulse ? undefined : status.icon} pulse={status.pulse} size="sm">
                            {status.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {plural(material.page_count, "page")}
                          {material.status === "ready" ? ` · ${plural(material.chunk_count, "chunk")} indexed` : null} ·
                          uploaded {new Date(material.created_at).toLocaleDateString()}
                        </p>
                        {isProfessor && material.error ? (
                          <p className="mt-1 text-xs text-danger">{material.error}</p>
                        ) : null}
                        {isProfessor && !material.has_file ? (
                          <p className="mt-1 text-xs text-muted">
                            Uploaded before original files were stored. Re-upload to enable viewing.
                          </p>
                        ) : null}
                      </div>
                      {material.has_file ? (
                        <OpenPdfButton
                          className={buttonClass("ghost", "sm")}
                          label="View"
                          load={() => getMaterialPdf(token, course.id, material.id)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Section>
        </Page>
      ) : null}
    </AppShell>
  );
}

function CourseCodeCard({ course }: { course: Course }) {
  const toast = useToast();
  return (
    <div className="w-full shrink-0 rounded-xl border border-line bg-surface-2/60 p-5 md:w-72">
      <p className="text-xs font-semibold text-muted">Course code</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="font-mono text-2xl font-bold tracking-widest text-fg">{course.code}</p>
        <IconButton
          icon={Copy}
          label="Copy course code"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(course.code)
              .then(() => toast.success("Course code copied"))
              .catch(() => toast.error("Could not copy the code"));
          }}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Students join with this code and can then ask the AI teaching assistant about the material below.
      </p>
      <Link className={buttonClass("primary", "md", "mt-4 w-full")} href={`/courses/${course.id}/analytics`}>
        <BarChart3 size={15} aria-hidden />
        Class analytics
      </Link>
    </div>
  );
}

function UploadPanel({
  token,
  course,
  onUploaded,
}: {
  token: string;
  course: Course;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; filename: string }
    | { kind: "done"; material: Material }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    setState({ kind: "uploading", filename: file.name });
    try {
      const material = await uploadMaterial(token, course.id, file);
      setState({ kind: "done", material });
      setFile(null);
    } catch (caughtError) {
      setState({
        kind: "error",
        message:
          caughtError instanceof ApiError ? caughtError.message : "Upload failed. Please try again.",
      });
    } finally {
      // Refresh either way: failed uploads are listed with their reason.
      onUploaded();
    }
  }

  const isUploading = state.kind === "uploading";

  return (
    <Card id="upload" className="mt-10 scroll-mt-20">
      <CardHeader
        title="Upload course material"
        description="PDFs are split into chunks, embedded and stored in the course knowledge base. Scanned PDFs without a text layer are not supported."
      />
      <form className="mt-5" onSubmit={handleUpload}>
        <Dropzone
          id="material"
          file={file}
          disabled={isUploading}
          onFile={(next) => {
            setFile(next);
            setState({ kind: "idle" });
          }}
        />
        {state.kind === "uploading" ? (
          <div className="mt-4">
            <p className="text-sm text-muted">
              Extracting text, chunking, embedding and storing {state.filename} in the knowledge base…
            </p>
            <ProgressBar label="Processing upload" className="mt-2" />
          </div>
        ) : null}
        {state.kind === "done" ? (
          <Callout tone="success" className="mt-4" title={`${state.material.filename} is ready`}>
            {plural(state.material.page_count, "page")} split into {plural(state.material.chunk_count, "chunk")}, embedded and
            indexed.
          </Callout>
        ) : null}
        {state.kind === "error" ? <Callout tone="danger" className="mt-4">{state.message}</Callout> : null}
        <div className="mt-4">
          <Button type="submit" variant="primary" icon={Upload} disabled={!file} loading={isUploading}>
            {isUploading ? "Processing…" : "Upload and index"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
