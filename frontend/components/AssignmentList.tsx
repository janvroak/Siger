import Link from "next/link";

import { plural } from "@/components/CourseCard";
import type { AssignmentSummary } from "@/lib/api";

export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Due in 3 days", "Due in 5 hours", "Closed 2 days ago". */
export function deadlineLabel(iso: string, now = Date.now()): { text: string; closed: boolean } {
  const diff = new Date(iso).getTime() - now;
  const hours = Math.round(Math.abs(diff) / 3_600_000);
  const span = hours < 48 ? plural(Math.max(hours, 1), "hour") : plural(Math.round(hours / 24), "day");
  return diff >= 0 ? { text: `Due in ${span}`, closed: false } : { text: `Closed ${span} ago`, closed: true };
}

export function DeadlineBadge({ deadline }: { deadline: string }) {
  const { text, closed } = deadlineLabel(deadline);
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        closed
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {text}
    </span>
  );
}

export function AssignmentList({
  courseId,
  assignments,
  emptyText,
}: {
  courseId: string;
  assignments: AssignmentSummary[];
  emptyText: string;
}) {
  if (assignments.length === 0) {
    return (
      <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {assignments.map((assignment) => (
        <li key={assignment.id}>
          <Link
            href={`/courses/${courseId}/assignments/${assignment.id}`}
            className="flex items-center gap-4 p-4 hover:bg-slate-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600">
              TASK
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{assignment.title}</p>
                <DeadlineBadge deadline={assignment.deadline} />
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {plural(assignment.question_count, "question")} ·{" "}
                {plural(assignment.total_marks, "mark")} · due {formatDeadline(assignment.deadline)}
              </p>
            </div>
            <span className="text-slate-400">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
