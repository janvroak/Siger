"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { AssignmentList } from "@/components/AssignmentList";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { courseAccent, plural } from "@/components/CourseCard";
import { primaryButton, secondaryButton } from "@/components/Modal";
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

const STATUS_STYLE: Record<Material["status"], string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<Material["status"], string> = {
  ready: "Ready",
  processing: "Processing",
  failed: "Failed",
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
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <Link className="text-sm text-slate-500 hover:text-slate-800" href="/dashboard">
            ← Dashboard
          </Link>

          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className={`h-2 bg-gradient-to-r ${courseAccent(course.code).band}`} />
            <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-md px-2 py-0.5 font-semibold ${courseAccent(course.code).soft}`}
                  >
                    {course.code}
                  </span>
                  <span className="text-slate-500">{course.semester}</span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold">{course.title}</h1>
                <p className="mt-1 text-sm text-slate-500">Taught by {course.professor_name}</p>
                <p className="mt-4 max-w-2xl whitespace-pre-wrap text-slate-700">
                  {course.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                  {isProfessor ? <span>{plural(course.student_count, "student")} enrolled</span> : null}
                  <span>{plural(readyCount, "document")} in the knowledge base</span>
                </div>
              </div>

              {isProfessor ? (
                <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm md:w-64">
                  <p className="font-medium">Course code</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-wider">{course.code}</p>
                  <p className="mt-2 text-slate-500">
                    Students join with this code and can then ask the AI Teaching Assistant about
                    the material below.
                  </p>
                </div>
              ) : (
                <div className="shrink-0 md:w-72">
                  {readyCount > 0 ? (
                    <Link className={`${primaryButton} w-full py-3`} href={`/courses/${course.id}/chat`}>
                      Open AI Teaching Assistant
                    </Link>
                  ) : (
                    <span className={`${secondaryButton} w-full cursor-not-allowed py-3`}>
                      Open AI Teaching Assistant
                    </span>
                  )}
                  <p className="mt-2 text-center text-xs text-slate-500">
                    {readyCount > 0
                      ? "Answers come only from this course's material, with sources."
                      : "Available once your professor uploads course material."}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assignments</h2>
              {isProfessor ? (
                <Link className={primaryButton} href={`/courses/${course.id}/assignments/new`}>
                  + New assignment
                </Link>
              ) : null}
            </div>
            {assignments ? (
              <AssignmentList
                courseId={course.id}
                assignments={assignments}
                audience={isProfessor ? "faculty" : "student"}
                emptyText={
                  isProfessor
                    ? "No assignments yet. Create one with questions and a model answer for each — submissions are graded against it."
                    : "No assignments have been posted yet."
                }
              />
            ) : null}
          </section>

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

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Course material</h2>
            {visibleMaterials && visibleMaterials.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                {isProfessor
                  ? "No material uploaded yet. Upload a PDF above to enable the AI Teaching Assistant."
                  : "Your professor hasn't uploaded any material yet."}
              </p>
            ) : null}
            <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {visibleMaterials?.map((material) => (
                <li key={material.id} className="flex items-start gap-4 p-4">
                  <PdfIcon />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{material.filename}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[material.status]}`}
                      >
                        {STATUS_LABEL[material.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {plural(material.page_count, "page")}
                      {material.status === "ready"
                        ? ` · ${plural(material.chunk_count, "chunk")} indexed`
                        : null}{" "}
                      · uploaded {new Date(material.created_at).toLocaleDateString()}
                    </p>
                    {isProfessor && material.error ? (
                      <p className="mt-1 text-sm text-red-700">{material.error}</p>
                    ) : null}
                    {isProfessor && !material.has_file ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Uploaded before original files were stored — re-upload to enable viewing.
                      </p>
                    ) : null}
                  </div>
                  {material.has_file ? (
                    <OpenPdfButton load={() => getMaterialPdf(token, course.id, material.id)} />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </AppShell>
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
  const fileInput = useRef<HTMLInputElement>(null);

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
      if (fileInput.current) {
        fileInput.current.value = "";
      }
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
    <section id="upload" className="mt-8 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Upload course material</h2>
      <p className="mt-1 text-sm text-slate-500">
        PDFs are split into chunks, embedded and stored in the course knowledge base. Scanned PDFs
        without a text layer are not supported.
      </p>

      <form className="mt-4" onSubmit={handleUpload}>
        <label
          htmlFor="material"
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center ${
            file ? "border-indigo-300 bg-indigo-50/50" : "border-slate-300 hover:bg-slate-50"
          }`}
        >
          <PdfIcon />
          <span className="mt-2 text-sm font-medium">
            {file ? file.name : "Choose a PDF to upload"}
          </span>
          <span className="mt-0.5 text-xs text-slate-500">
            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF up to 20 MB"}
          </span>
          <input
            id="material"
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setState({ kind: "idle" });
            }}
            disabled={isUploading}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={primaryButton} type="submit" disabled={!file || isUploading}>
            {isUploading ? "Processing…" : "Upload and index"}
          </button>
          {state.kind === "uploading" ? (
            <p className="flex items-center gap-2 text-sm text-sky-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
              Extracting text, chunking, embedding and storing {state.filename} in the knowledge
              base…
            </p>
          ) : null}
          {state.kind === "done" ? (
            <p className="text-sm text-emerald-700">
              ✓ {state.material.filename} is ready: {plural(state.material.page_count, "page")} split
              into {plural(state.material.chunk_count, "chunk")}, embedded and indexed.
            </p>
          ) : null}
          {state.kind === "error" ? <p className="text-sm text-red-700">{state.message}</p> : null}
        </div>
      </form>
    </section>
  );
}

function PdfIcon() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[10px] font-bold text-red-600">
      PDF
    </span>
  );
}
