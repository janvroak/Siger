"use client";

import Link from "next/link";

import { secondaryButton } from "@/components/Modal";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { StatusBadge } from "@/components/SubmissionStatus";
import { getSubmissionPdf, type SubmissionRoster } from "@/lib/api";

/** Faculty view: who has submitted, who hasn't, and who missed the deadline. */
export function RosterPanel({
  token,
  courseId,
  assignmentId,
  roster,
  onRefresh,
}: {
  token: string;
  courseId: string;
  assignmentId: string;
  roster: SubmissionRoster;
  onRefresh: () => void;
}) {
  const completion = roster.enrolled ? Math.round((roster.submitted / roster.enrolled) * 100) : 0;
  const tiles = [
    { label: "Enrolled", value: roster.enrolled },
    { label: "Submitted", value: roster.submitted, note: `${completion}%` },
    { label: "Pending", value: roster.pending },
    { label: "Overdue", value: roster.overdue, alert: roster.overdue > 0 },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Submissions</h2>
        <button className={secondaryButton} onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">{tile.label}</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${tile.alert ? "text-red-700" : ""}`}
            >
              {tile.value}
              {tile.note ? (
                <span className="ml-2 text-sm font-normal text-slate-500">{tile.note}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {roster.students.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No students are enrolled yet. Share the course code so they can join.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Student</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Submitted</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roster.students.map((row) => (
                <tr key={row.student_id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium">{row.student_name}</p>
                    <p className="text-xs text-slate-500">{row.student_email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge audience="faculty" state={row.state} />
                    {row.error ? (
                      <p className="mt-1 max-w-xs text-xs text-red-700">{row.error}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {row.submission ? new Date(row.submission.submitted_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-3 text-right">
                    {row.submission ? (
                      <span className="inline-flex items-start gap-2">
                        <OpenPdfButton
                          label="PDF ↗"
                          load={() =>
                            getSubmissionPdf(token, courseId, assignmentId, row.submission!.id)
                          }
                        />
                        <Link
                          className={secondaryButton}
                          href={`/courses/${courseId}/assignments/${assignmentId}/submissions/${row.submission.id}`}
                        >
                          {row.state === "under_review" ? "Review →" : "Open →"}
                        </Link>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
