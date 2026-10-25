import { ArrowRight, CalendarClock, CalendarX2, ClipboardList, FileQuestion } from "lucide-react";
import Link from "next/link";

import { plural } from "@/components/CourseCard";
import { StatusBadge } from "@/components/SubmissionStatus";
import { Badge } from "@/components/ui/Badge";
import { ScoreChip } from "@/components/ui/Metrics";
import { EmptyState } from "@/components/ui/States";
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

/** "Due in 3 days", "Due in 5 hours", "Closed 2 days ago"; soon = due within 48 hours. */
export function deadlineLabel(iso: string, now = Date.now()): { text: string; closed: boolean; soon: boolean } {
  const diff = new Date(iso).getTime() - now;
  const hours = Math.round(Math.abs(diff) / 3_600_000);
  const span = hours < 48 ? plural(Math.max(hours, 1), "hour") : plural(Math.round(hours / 24), "day");
  return diff >= 0
    ? { text: `Due in ${span}`, closed: false, soon: diff < 48 * 3_600_000 }
    : { text: `Closed ${span} ago`, closed: true, soon: false };
}

export function DeadlineBadge({ deadline }: { deadline: string }) {
  const { text, closed, soon } = deadlineLabel(deadline);
  return (
    <Badge tone={closed ? "neutral" : soon ? "warning" : "info"} icon={closed ? CalendarX2 : CalendarClock}>
      {text}
    </Badge>
  );
}

export function AssignmentList({
  courseId,
  assignments,
  audience,
  emptyText,
}: {
  courseId: string;
  assignments: AssignmentSummary[];
  audience: "student" | "faculty";
  emptyText: string;
}) {
  if (assignments.length === 0) {
    return <EmptyState icon={ClipboardList} title="No assignments yet" body={emptyText} />;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      {assignments.map((assignment) => (
        <li key={assignment.id}>
          <Link
            href={`/courses/${courseId}/assignments/${assignment.id}`}
            className="group flex items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-surface-2 sm:px-5"
          >
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-text sm:flex">
              <FileQuestion size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{assignment.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {plural(assignment.question_count, "question")} · {plural(assignment.total_marks, "mark")} · due{" "}
                {formatDeadline(assignment.deadline)}
                {assignment.submission_count !== null ? ` · ${plural(assignment.submission_count, "submission")}` : null}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <DeadlineBadge deadline={assignment.deadline} />
                {audience === "student" ? (
                  <StatusBadge
                    audience="student"
                    state={assignment.my_status ?? (deadlineLabel(assignment.deadline).closed ? "overdue" : "not_submitted")}
                  />
                ) : null}
              </div>
            </div>
            {assignment.my_score !== null ? <ScoreChip value={assignment.my_score} max={assignment.total_marks} /> : null}
            <ArrowRight size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
