"use client";

import { ArrowRight, CalendarX2, Clock, Eye, RefreshCw, Send, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/ClassDashboard";
import { OpenPdfButton } from "@/components/OpenPdfButton";
import { StatusBadge } from "@/components/SubmissionStatus";
import { Button, buttonClass, cn } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { DataTable } from "@/components/ui/Table";
import { getSubmissionPdf, type RosterRow, type SubmissionRoster } from "@/lib/api";

const STATE_ORDER: Record<RosterRow["state"], number> = {
  under_review: 0,
  failed: 1,
  evaluating: 2,
  submitted: 3,
  overdue: 4,
  not_submitted: 5,
  published: 6,
};

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
  const [refreshing, setRefreshing] = useState(false);
  const completion = roster.enrolled ? roster.submitted / roster.enrolled : 0;
  const toReview = roster.students.filter((row) => row.state === "under_review").length;

  const tiles = [
    { label: "Enrolled", value: roster.enrolled, icon: Users },
    { label: "Submitted", value: roster.submitted, icon: Send, note: `${Math.round(completion * 100)}%` },
    { label: "To review", value: toReview, icon: Eye, tone: toReview ? "text-warning" : "" },
    { label: "Pending", value: roster.pending, icon: Clock },
    { label: "Overdue", value: roster.overdue, icon: CalendarX2, tone: roster.overdue ? "text-danger" : "" },
  ];

  return (
    <Card padded={false} className="mt-6">
      <div className="p-5 sm:p-6">
        <CardHeader
          title="Submissions"
          description="Open a submission to review the AI grade before publishing it."
          action={
            <Button
              size="sm"
              icon={RefreshCw}
              loading={refreshing}
              onClick={() => {
                setRefreshing(true);
                onRefresh();
                setTimeout(() => setRefreshing(false), 600);
              }}
            >
              Refresh
            </Button>
          }
        />
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.label} className="bg-surface px-4 py-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <tile.icon size={13} aria-hidden />
                {tile.label}
              </dt>
              <dd className={cn("mt-1 font-display text-2xl font-bold text-fg tabular-nums", tile.tone)}>
                {tile.value}
                {tile.note ? <span className="ml-1.5 font-sans text-xs font-medium text-muted">{tile.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]" aria-hidden>
          <div className="h-full rounded-full bg-[var(--viz-series-1)] transition-[width] duration-500" style={{ width: `${completion * 100}%` }} />
        </div>
      </div>

      {roster.students.length === 0 ? (
        <div className="px-6 pb-6">
          <EmptyState compact icon={Users} title="No students enrolled yet" body="Share the course code so they can join." />
        </div>
      ) : (
        <div className="border-t border-line">
          <DataTable<RosterRow>
            caption="Submissions"
            rows={roster.students}
            rowKey={(row) => row.student_id}
            rowClassName={(row) => (row.state === "under_review" ? "bg-warning-soft/40" : undefined)}
            columns={[
              {
                key: "student",
                header: "Student",
                sortValue: (row) => row.student_name.toLowerCase(),
                cell: (row) => (
                  <div className="flex items-center gap-3">
                    <Avatar name={row.student_name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{row.student_name}</p>
                      <p className="truncate text-xs text-muted">{row.student_email}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                sortValue: (row) => STATE_ORDER[row.state],
                cell: (row) => (
                  <div>
                    <StatusBadge audience="faculty" state={row.state} />
                    {row.error ? <p className="mt-1 max-w-xs text-xs text-danger">{row.error}</p> : null}
                  </div>
                ),
              },
              {
                key: "submitted",
                header: "Submitted",
                sortValue: (row) => row.submission?.submitted_at ?? null,
                cell: (row) => (
                  <span className="whitespace-nowrap text-muted tabular-nums">
                    {row.submission ? new Date(row.submission.submitted_at).toLocaleString() : "—"}
                  </span>
                ),
              },
              {
                key: "marks",
                header: "Marks",
                align: "right",
                sortValue: (row) => row.final_marks ?? row.ai_marks,
                cell: (row) =>
                  row.final_marks !== null ? (
                    <span className="font-semibold text-fg tabular-nums">
                      {row.final_marks}
                      <span className="font-normal text-muted"> / {roster.total_marks}</span>
                    </span>
                  ) : row.ai_marks !== null ? (
                    <span className="text-muted tabular-nums">
                      AI {row.ai_marks} / {roster.total_marks}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  ),
              },
              {
                key: "actions",
                header: <span className="sr-only">Actions</span>,
                align: "right",
                cell: (row) =>
                  row.submission ? (
                    <span className="inline-flex items-center justify-end gap-2">
                      <OpenPdfButton
                        label="PDF"
                        className={buttonClass("ghost", "sm")}
                        load={() => getSubmissionPdf(token, courseId, assignmentId, row.submission!.id)}
                      />
                      <Link
                        className={buttonClass(row.state === "under_review" ? "primary" : "secondary", "sm")}
                        href={`/courses/${courseId}/assignments/${assignmentId}/submissions/${row.submission.id}`}
                      >
                        {row.state === "under_review" ? "Review" : "Open"}
                        <ArrowRight size={14} aria-hidden />
                      </Link>
                    </span>
                  ) : null,
              },
            ]}
          />
        </div>
      )}
    </Card>
  );
}
