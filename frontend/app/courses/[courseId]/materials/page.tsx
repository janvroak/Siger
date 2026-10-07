"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  ApiError,
  getMyCourses,
  listMaterials,
  uploadMaterial,
  type Course,
  type Material,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

const STATUS_STYLE: Record<Material["status"], string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  processing: "border-sky-200 bg-sky-50 text-sky-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

export default function CourseMaterialsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { token, error: authError } = useAuthedUser("professor");

  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [pageError, setPageError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadCourse(activeToken: string) {
      try {
        const owned = await getMyCourses(activeToken);
        const selected = owned.find((item) => item.id === courseId);
        if (!selected) {
          setPageError("You can only manage material for courses you teach.");
          return;
        }
        setCourse(selected);
        setMaterials(await listMaterials(activeToken, selected.id));
      } catch {
        setPageError("Unable to load this course.");
      }
    }
    void loadCourse(token);
  }, [token, courseId]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !course || !file) {
      return;
    }
    setUploadError("");
    setUploadNotice("");
    setIsUploading(true);

    try {
      const material = await uploadMaterial(token, course.id, file);
      setUploadNotice(
        `${material.filename} is ready: ${material.page_count} pages split into ${material.chunk_count} chunks.`,
      );
      setFile(null);
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    } catch (caughtError) {
      setUploadError(
        caughtError instanceof ApiError ? caughtError.message : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
      // Refresh either way: failed uploads are listed with their reason.
      listMaterials(token, course.id).then(setMaterials).catch(() => undefined);
    }
  }

  const error = authError || pageError;

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Link className="text-sm text-slate-500 hover:text-slate-800" href="/dashboard">
        ← Dashboard
      </Link>
      {error ? (
        <p className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {!error && !course ? <p className="mt-6 text-slate-600">Loading course...</p> : null}

      {course ? (
        <>
          <header className="mt-4 border-b border-slate-200 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {course.code} · {course.semester}
            </p>
            <h1 className="text-xl font-semibold">{course.title} — course material</h1>
            <p className="mt-1 text-sm text-slate-600">
              Uploaded PDFs are split into chunks, embedded and stored in the course knowledge
              base. Students&apos; questions are answered only from this material.
            </p>
          </header>

          <form
            className="mt-6 space-y-3 rounded border border-slate-200 bg-white p-4"
            onSubmit={handleUpload}
          >
            <label className="block text-sm font-medium" htmlFor="material">
              Upload a PDF
            </label>
            <input
              id="material"
              ref={fileInput}
              className="block w-full text-sm file:mr-3 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={isUploading}
            />
            {uploadError ? <p className="text-sm text-red-700">{uploadError}</p> : null}
            {uploadNotice ? <p className="text-sm text-emerald-700">{uploadNotice}</p> : null}
            <button
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              type="submit"
              disabled={!file || isUploading}
            >
              {isUploading ? "Extracting, chunking and embedding…" : "Upload"}
            </button>
          </form>

          <section className="mt-8">
            <h2 className="font-semibold">Uploaded material</h2>
            {materials && materials.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No material uploaded yet.</p>
            ) : null}
            <ul className="mt-3 space-y-2">
              {materials?.map((material) => (
                <li
                  key={material.id}
                  className="rounded border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{material.filename}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[material.status]}`}
                    >
                      {material.status}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {material.page_count} pages · {material.chunk_count} chunks · uploaded{" "}
                    {new Date(material.created_at).toLocaleString()}
                  </p>
                  {material.error ? (
                    <p className="mt-1 text-red-700">{material.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
