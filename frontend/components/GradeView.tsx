"use client";

import { Check, MessageSquareQuote, X } from "lucide-react";
import { useEffect, useState } from "react";

import { SourceChips } from "@/components/QuestionResultCard";
import { PointChip, Tag } from "@/components/ui/Badge";
import { ScoreRing } from "@/components/ui/Metrics";
import { Callout, Skeleton } from "@/components/ui/States";
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
    return <Callout tone="danger" className="mt-5">{error}</Callout>;
  }
  if (!result) {
    return (
      <div className="mt-5 space-y-3" role="status" aria-label="Loading your grade">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const percent = result.max_marks ? Math.round((result.total_marks / result.max_marks) * 100) : 0;
  return (
    <div className="mt-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-accent-line bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_75%)] p-5">
        <ScoreRing value={result.total_marks} max={result.max_marks} size={80} label={`Your grade ${result.total_marks} of ${result.max_marks}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-accent-text">Your grade</p>
          <p className="mt-0.5 font-display text-3xl font-bold text-fg tabular-nums">
            {percent}%
          </p>
          <p className="text-xs text-muted">Published {new Date(result.published_at).toLocaleDateString()} · reviewed by your professor</p>
        </div>
      </div>

      <ol className="mt-5 space-y-4">
        {result.questions.map((question) => (
          <li key={question.position} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-bold text-fg">Q{question.position}</span>
                  <Tag>{question.topic}</Tag>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-fg">{question.text}</p>
              </div>
              <ScoreRing value={question.marks} max={question.max_marks} />
            </div>

            {question.key_points_hit.length || question.key_points_missed.length ? (
              <div className="mt-4 space-y-3">
                {question.key_points_hit.length ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted">You covered</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {question.key_points_hit.map((point) => (
                        <PointChip key={point} tone="success" icon={Check}>{point}</PointChip>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {question.key_points_missed.length ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted">To review</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {question.key_points_missed.map((point) => (
                        <PointChip key={point} tone="danger" icon={X}>{point}</PointChip>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex gap-3 rounded-lg border-l-2 border-accent bg-accent-soft px-4 py-3">
              <MessageSquareQuote size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="text-xs font-semibold text-accent-text">Feedback</p>
                <p className="mt-0.5 leading-relaxed text-fg">{question.feedback}</p>
                {question.feedback_sources.length > 0 ? (
                  <>
                    <p className="mt-2.5 text-xs text-muted">Study these pages</p>
                    <SourceChips sources={question.feedback_sources} />
                  </>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
