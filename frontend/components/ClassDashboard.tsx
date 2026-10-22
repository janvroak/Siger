import Link from "next/link";

import {
  ChartCard,
  pct,
  StatTile,
  tableClass,
  tdClass,
  thClass,
} from "@/components/charts/ChartParts";
import {
  CompletionBars,
  CompletionLegend,
  CompletionTable,
} from "@/components/charts/CompletionBars";
import { MasteryBars, MasteryTable } from "@/components/charts/MasteryBars";
import { plural } from "@/components/CourseCard";
import type { CourseAnalytics } from "@/lib/api";

/** Faculty view of a course: mastery, learning gaps, completion, students, AI agreement. */
export function ClassDashboard({ analytics, courseId }: { analytics: CourseAnalytics; courseId: string }) {
  const gaps = analytics.topics.filter((topic) => topic.is_gap);
  const agreement = analytics.agreement;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Class comprehension"
          value={pct(analytics.comprehension)}
          note={`${plural(analytics.enrolled, "student")} · published grades only`}
        />
        <StatTile
          label="Completion"
          value={pct(analytics.completion_rate)}
          note={`Submissions across ${plural(analytics.assignments, "assignment")}`}
        />
        <StatTile
          label="Learning gaps"
          value={String(gaps.length)}
          note={gaps.length ? gaps.map((gap) => gap.topic).join(", ") : `No topic below ${pct(analytics.gap_threshold)}`}
        />
        <StatTile
          label="Overdue submissions"
          value={String(analytics.overdue.length)}
          note={
            analytics.overdue.length
              ? `${plural(new Set(analytics.overdue.map((o) => o.student_id)).size, "student")} behind`
              : "Everyone is on time"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Topic mastery"
          subtitle="Class marks per topic, weakest first"
          table={analytics.topics.length ? <MasteryTable items={analytics.topics} /> : undefined}
        >
          <MasteryBars items={analytics.topics} threshold={analytics.gap_threshold} />
        </ChartCard>
        <ChartCard
          title="Completion by assignment"
          subtitle="Enrolled students who submitted, are not yet due, or missed the deadline"
          legend={analytics.completion.length ? <CompletionLegend /> : undefined}
          table={analytics.completion.length ? <CompletionTable items={analytics.completion} /> : undefined}
        >
          <CompletionBars items={analytics.completion} />
        </ChartCard>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Students</h2>
        <p className="mt-0.5 text-sm text-slate-500">Lowest comprehension first; students without a published grade at the end.</p>
        {analytics.students.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No students enrolled yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Student</th>
                  <th className={thClass}>Comprehension</th>
                  <th className={thClass}>Graded</th>
                  <th className={thClass}>Submitted</th>
                  <th className={thClass}>Overdue</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {analytics.students.map((student) => (
                  <tr key={student.student_id}>
                    <td className={tdClass}>
                      <p className="font-medium">{student.student_name}</p>
                      <p className="text-xs text-slate-500">{student.student_email}</p>
                    </td>
                    <td className={tdClass}>
                      {pct(student.comprehension)}
                      {student.comprehension !== null && student.comprehension < analytics.gap_threshold ? (
                        <span className="ml-1.5 text-xs text-red-700">▲ at risk</span>
                      ) : null}
                    </td>
                    <td className={tdClass}>{student.graded}</td>
                    <td className={tdClass}>{student.submitted}</td>
                    <td className={tdClass}>{student.overdue || "—"}</td>
                    <td className={`${tdClass} text-right`}>
                      <Link
                        className="text-indigo-600 hover:text-indigo-800"
                        href={`/courses/${courseId}/analytics/students/${student.student_id}`}
                      >
                        Progress →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Overdue work</h2>
          {analytics.overdue.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No missed deadlines.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {analytics.overdue.map((item) => (
                <li key={`${item.student_id}:${item.assignment_id}`} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="text-red-700" aria-hidden>
                      ▲{" "}
                    </span>
                    {item.student_name}
                  </span>
                  <span className="text-slate-500">
                    {item.assignment_title} · due {new Date(item.deadline).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">AI grading vs faculty review</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            How often your published marks matched the evaluation agent&apos;s marks.
          </p>
          {agreement.reviewed_answers === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No reviewed answers yet.</p>
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <Metric label="Exact agreement" value={pct(agreement.exact_agreement)} note={`of ${plural(agreement.reviewed_answers, "answer")}`} />
              <Metric label="Within ½ mark" value={pct(agreement.within_half_mark)} />
              <Metric
                label="Average change"
                value={agreement.mean_abs_difference === null ? "—" : `${agreement.mean_abs_difference} marks`}
                note={`${plural(agreement.overrides, "override")}`}
              />
              <Metric
                label="Flags that were right"
                value={agreement.flagged ? pct(agreement.flagged_overridden / agreement.flagged) : "—"}
                note={`${agreement.flagged_overridden} of ${plural(agreement.flagged, "flag")} led to an override`}
              />
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
      {note ? <dd className="text-xs text-slate-400">{note}</dd> : null}
    </div>
  );
}
