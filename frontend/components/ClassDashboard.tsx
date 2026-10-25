"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  TrendingDown,
  Users,
} from "lucide-react";
import Link from "next/link";

import { ChartCard, pct } from "@/components/charts/ChartParts";
import { CompletionBars, CompletionDonut, CompletionLegend, CompletionTable } from "@/components/charts/CompletionBars";
import { MasteryBars, MasteryTable, TopicColumns } from "@/components/charts/MasteryBars";
import { plural } from "@/components/CourseCard";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/Metrics";
import { EmptyState } from "@/components/ui/States";
import { DataTable } from "@/components/ui/Table";
import type { CourseAnalytics } from "@/lib/api";

type StudentRow = CourseAnalytics["students"][number];
type OverdueRow = CourseAnalytics["overdue"][number];

/** Faculty view of a course: mastery, learning gaps, completion, students, AI agreement. */
export function ClassDashboard({ analytics, courseId }: { analytics: CourseAnalytics; courseId: string }) {
  const gaps = analytics.topics.filter((topic) => topic.is_gap);
  const agreement = analytics.agreement;
  const behind = new Set(analytics.overdue.map((o) => o.student_id)).size;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          emphasis
          icon={GraduationCap}
          label="Class comprehension"
          value={pct(analytics.comprehension)}
          note={`${plural(analytics.enrolled, "student")} · published grades only`}
        />
        <StatCard
          icon={ClipboardCheck}
          label="Completion"
          value={pct(analytics.completion_rate)}
          note={`Across ${plural(analytics.assignments, "assignment")}`}
        />
        <StatCard
          icon={TrendingDown}
          tone={gaps.length ? "danger" : "success"}
          label="Learning gaps"
          value={gaps.length}
          note={gaps.length ? gaps.map((gap) => gap.topic).join(", ") : `No topic below ${pct(analytics.gap_threshold)}`}
        />
        <StatCard
          icon={CalendarX2}
          tone={analytics.overdue.length ? "warning" : "success"}
          label="Overdue submissions"
          value={analytics.overdue.length}
          note={analytics.overdue.length ? `${plural(behind, "student")} behind` : "Everyone is on time"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Completion"
          subtitle="Submitted, not yet due, or missed, per student and assignment"
          table={analytics.completion.length ? <CompletionTable items={analytics.completion} /> : undefined}
        >
          <CompletionDonut items={analytics.completion} rate={analytics.completion_rate} />
          {analytics.completion.length ? (
            <div className="mt-6 border-t border-line pt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted">By assignment</p>
                <CompletionLegend />
              </div>
              <CompletionBars items={analytics.completion} />
            </div>
          ) : null}
        </ChartCard>

        <ChartCard
          title="Weakest topics"
          subtitle="Class mastery, lowest first. Red bars are learning gaps."
          table={analytics.topics.length ? <MasteryTable items={analytics.topics} /> : undefined}
        >
          <MasteryBars items={analytics.topics} threshold={analytics.gap_threshold} limit={6} />
        </ChartCard>
      </div>

      <ChartCard
        title="Class topic averages"
        subtitle="Marks earned out of marks possible, per topic"
        table={analytics.topics.length ? <MasteryTable items={analytics.topics} /> : undefined}
      >
        {/* Column labels collide on phones, so small screens get the same data as labelled bars. */}
        <div className="hidden sm:block">
          <TopicColumns items={analytics.topics} threshold={analytics.gap_threshold} />
        </div>
        <div className="sm:hidden">
          <MasteryBars items={analytics.topics} threshold={analytics.gap_threshold} />
        </div>
      </ChartCard>

      <Card padded={false}>
        <div className="p-5 pb-4 sm:p-6 sm:pb-4">
          <CardHeader
            title="Students"
            description="Lowest comprehension first. Click a header to sort."
            icon={<HeaderIcon icon={Users} />}
          />
        </div>
        {analytics.students.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState compact icon={Users} title="No students enrolled yet" body="Share the course code so students can join." />
          </div>
        ) : (
          <DataTable<StudentRow>
            caption="Students"
            rows={analytics.students}
            rowKey={(row) => row.student_id}
            maxHeight="28rem"
            columns={[
              {
                key: "name",
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
                key: "comprehension",
                header: "Comprehension",
                sortValue: (row) => row.comprehension,
                cell: (row) => <ComprehensionCell value={row.comprehension} threshold={analytics.gap_threshold} />,
              },
              { key: "graded", header: "Graded", align: "right", sortValue: (row) => row.graded, cell: (row) => <span className="tabular-nums">{row.graded}</span> },
              { key: "submitted", header: "Submitted", align: "right", sortValue: (row) => row.submitted, cell: (row) => <span className="tabular-nums">{row.submitted}</span> },
              {
                key: "overdue",
                header: "Overdue",
                align: "right",
                sortValue: (row) => row.overdue,
                cell: (row) =>
                  row.overdue ? (
                    <span className="inline-flex items-center gap-1 font-medium text-danger tabular-nums">
                      <AlertTriangle size={13} aria-hidden />
                      {row.overdue}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  ),
              },
              {
                key: "link",
                header: <span className="sr-only">Progress</span>,
                align: "right",
                cell: (row) => (
                  <Link
                    className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-accent-text opacity-80 transition-opacity group-hover:opacity-100 hover:underline"
                    href={`/courses/${courseId}/analytics/students/${row.student_id}`}
                  >
                    Progress
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                ),
              },
            ]}
          />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 pb-4 sm:p-6 sm:pb-4">
            <CardHeader
              title="Overdue work"
              description="Enrolled students with no submission after the deadline"
              icon={<HeaderIcon icon={CalendarX2} />}
            />
          </div>
          {analytics.overdue.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState compact icon={CheckCircle2} title="No missed deadlines" />
            </div>
          ) : (
            <DataTable<OverdueRow>
              caption="Overdue work"
              rows={analytics.overdue}
              rowKey={(row) => `${row.student_id}:${row.assignment_id}`}
              maxHeight="20rem"
              columns={[
                {
                  key: "student",
                  header: "Student",
                  sortValue: (row) => row.student_name.toLowerCase(),
                  cell: (row) => (
                    <span className="inline-flex items-center gap-2 font-medium text-fg">
                      <AlertTriangle size={14} className="text-danger" aria-label="Overdue" />
                      {row.student_name}
                    </span>
                  ),
                },
                { key: "assignment", header: "Assignment", sortValue: (row) => row.assignment_title, cell: (row) => <span className="text-muted">{row.assignment_title}</span> },
                {
                  key: "deadline",
                  header: "Due",
                  align: "right",
                  sortValue: (row) => row.deadline,
                  cell: (row) => <span className="whitespace-nowrap text-muted tabular-nums">{new Date(row.deadline).toLocaleDateString()}</span>,
                },
              ]}
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="AI grading vs faculty review"
            description="How often your published marks matched the evaluation agent."
            icon={<HeaderIcon icon={Bot} />}
          />
          {agreement.reviewed_answers === 0 ? (
            <EmptyState compact className="mt-4" icon={Bot} title="No reviewed answers yet" />
          ) : (
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <Metric label="Exact agreement" value={pct(agreement.exact_agreement)} note={`of ${plural(agreement.reviewed_answers, "answer")}`} />
              <Metric label="Within ½ mark" value={pct(agreement.within_half_mark)} />
              <Metric
                label="Average change"
                value={agreement.mean_abs_difference === null ? "—" : `${agreement.mean_abs_difference}`}
                note={`marks · ${plural(agreement.overrides, "override")}`}
              />
              <Metric
                label="Flags that were right"
                value={agreement.flagged ? pct(agreement.flagged_overridden / agreement.flagged) : "—"}
                note={`${agreement.flagged_overridden} of ${plural(agreement.flagged, "flag")} led to an override`}
              />
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}

function HeaderIcon({ icon: Icon }: { icon: typeof Users }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
      <Icon size={16} aria-hidden />
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted">
      {initials}
    </span>
  );
}

function ComprehensionCell({ value, threshold }: { value: number | null; threshold: number }) {
  if (value === null) {
    return <span className="text-xs text-muted">No grades yet</span>;
  }
  const atRisk = value < threshold;
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-right font-semibold text-fg tabular-nums">{pct(value)}</span>
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-[var(--viz-track)] sm:block" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${value * 100}%`, background: atRisk ? "var(--viz-critical)" : "var(--viz-series-1)" }}
        />
      </span>
      {atRisk ? (
        <Badge tone="danger" icon={AlertTriangle} size="sm">
          At risk
        </Badge>
      ) : null}
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-display text-xl font-bold text-fg tabular-nums">{value}</dd>
      {note ? <dd className="mt-0.5 text-xs text-muted">{note}</dd> : null}
    </div>
  );
}
