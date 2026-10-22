"use client";

import { useEffect, useState } from "react";

import { getMyResult, type StudentResult } from "@/lib/api";

/** The student's published grade: marks, what they covered and missed, feedback. */
export function GradeView({
  token,
  courseId,
  assignmentId,
}: {
  token: string;
  courseId: string;
  assignmentId: string;
}) {
  const [result, setResult] = useState<StudentResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyResult(token, courseId, assignmentId)
      .then(setResult)
      .catch(() => setError("Could not load your grade."));
  }, [token, courseId, assignmentId]);

  if (error) {
    return <p className="mt-4 text-sm text-red-700">{error}</p>;
  }
  if (!result) {
    return <p className="mt-4 text-sm text-slate-500">Loading your grade…</p>;
  }

  const percent = result.max_marks ? Math.round((result.total_marks / result.max_marks) * 100) : 0;
  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-4 rounded-xl bg-emerald-50 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Your grade</p>
          <p className="mt-1">
            <span className="text-3xl font-semibold tabular-nums">{result.total_marks}</span>
            <span className="text-slate-600"> / {result.max_marks}</span>
            <span className="ml-2 text-sm text-slate-600">({percent}%)</span>
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Published {new Date(result.published_at).toLocaleDateString()}
        </p>
      </div>

      <ol className="mt-4 space-y-3">
        {result.questions.map((question) => (
          <li key={question.position} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <span className="font-semibold">Q{question.position}</span>{" "}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {question.topic}
                </span>
                <p className="mt-1 text-slate-700">{question.text}</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">
                {question.marks}
                <span className="font-normal text-slate-500"> / {question.max_marks}</span>
              </p>
            </div>
            {question.key_points_hit.length || question.key_points_missed.length ? (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <Points title="You covered" tone="text-emerald-700" marker="✓" items={question.key_points_hit} />
                <Points title="To review" tone="text-red-700" marker="•" items={question.key_points_missed} />
              </div>
            ) : null}
            <p className="mt-3 rounded-lg bg-indigo-50/60 p-3 text-sm text-slate-800">
              {question.feedback}
            </p>
            {question.feedback_sources.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Study:{" "}
                {question.feedback_sources
                  .map((source) => `${source.filename}, page ${source.page}`)
                  .join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Points({
  title,
  tone,
  marker,
  items,
}: {
  title: string;
  tone: string;
  marker: string;
  items: string[];
}) {
  if (!items.length) {
    return <div />;
  }
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1 space-y-0.5 text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className={tone}>{marker}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
