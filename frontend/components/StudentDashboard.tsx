import Link from "next/link";

import { ChartCard, pct, StatTile } from "@/components/charts/ChartParts";
import { MasteryBars, MasteryTable } from "@/components/charts/MasteryBars";
import { TrendChart, TrendTable } from "@/components/charts/TrendChart";
import { plural } from "@/components/CourseCard";
import type { StudentProgress } from "@/lib/api";

const STATE_LABEL: Record<StudentProgress["assignments"][number]["state"], string> = {
  graded: "Graded",
  under_review: "Being graded",
  submitted: "Being graded",
  failed: "Being graded",
  overdue: "Missed",
  pending: "Not submitted",
};

/** A student's progress in one course: comprehension, topics, trend, assignments. */
export function StudentDashboard({
  progress,
  courseId,
  viewer,
}: {
  progress: StudentProgress;
  courseId: string;
  viewer: "student" | "faculty";
}) {
  const graded = progress.assignments.filter((a) => a.state === "graded").length;
  const missed = progress.assignments.filter((a) => a.state === "overdue").length;
  const gaps = progress.topics.filter((topic) => topic.is_gap);
  const you = viewer === "student";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Comprehension score"
          value={pct(progress.comprehension)}
          note={
            progress.comprehension === null
              ? "Appears after the first published grade"
              : "All published marks, weighted by marks"
          }
        />
        <StatTile
          label="Assignments graded"
          value={`${graded} / ${progress.assignments.length}`}
        />
        <StatTile label="Missed deadlines" value={String(missed)} />
        <StatTile
          label="Learning gaps"
          value={String(gaps.length)}
          note={gaps.length ? gaps.map((gap) => gap.topic).join(", ") : `Topics below ${pct(progress.gap_threshold)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Topic mastery"
          subtitle={`${you ? "Your" : "Their"} marks per topic, weakest first`}
          table={progress.topics.length ? <MasteryTable items={progress.topics} /> : undefined}
        >
          <MasteryBars items={progress.topics} threshold={progress.gap_threshold} />
        </ChartCard>
        <ChartCard
          title="Score trend"
          subtitle="Published score per assignment, by deadline"
          table={progress.trend.length ? <TrendTable items={progress.trend} /> : undefined}
        >
          <TrendChart items={progress.trend} />
        </ChartCard>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Assignments</h2>
        {progress.assignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No assignments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {progress.assignments.map((assignment) => (
              <li key={assignment.assignment_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link
                  className="min-w-0 truncate hover:underline"
                  href={`/courses/${courseId}/assignments/${assignment.assignment_id}`}
                >
                  {assignment.title}
                </Link>
                <span className="flex shrink-0 items-center gap-3 text-slate-500">
                  <span>due {new Date(assignment.deadline).toLocaleDateString()}</span>
                  <span className={assignment.state === "overdue" ? "font-medium text-red-700" : ""}>
                    {assignment.state === "overdue" ? "▲ " : ""}
                    {STATE_LABEL[assignment.state]}
                  </span>
                  <span className="w-12 text-right font-medium tabular-nums text-slate-800">
                    {pct(assignment.score)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Only published grades count. {plural(progress.trend.length, "graded assignment")} so far.
        </p>
      </section>
    </div>
  );
}
