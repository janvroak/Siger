"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarX2,
  CheckCircle2,
  CircleDashed,
  Clock,
  GraduationCap,
  ListChecks,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ChartCard, pct } from "@/components/charts/ChartParts";
import { MasteryBars, MasteryTable, TopicRadar } from "@/components/charts/MasteryBars";
import { TrendChart, TrendTable } from "@/components/charts/TrendChart";
import { plural } from "@/components/CourseCard";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/Metrics";
import { EmptyState } from "@/components/ui/States";
import type { StudentProgress } from "@/lib/api";

type AssignmentState = StudentProgress["assignments"][number]["state"];

const STATE: Record<AssignmentState, { label: string; tone: Tone; icon: LucideIcon }> = {
  graded: { label: "Graded", tone: "success", icon: CheckCircle2 },
  under_review: { label: "Being graded", tone: "accent", icon: Clock },
  submitted: { label: "Being graded", tone: "accent", icon: Clock },
  failed: { label: "Being graded", tone: "accent", icon: Clock },
  overdue: { label: "Missed", tone: "danger", icon: AlertTriangle },
  pending: { label: "Not submitted", tone: "neutral", icon: CircleDashed },
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          emphasis
          icon={GraduationCap}
          label="Comprehension score"
          value={pct(progress.comprehension)}
          note={
            progress.comprehension === null
              ? "Appears after the first published grade"
              : "All published marks, weighted by marks"
          }
        />
        <StatCard icon={ListChecks} label="Assignments graded" value={`${graded} / ${progress.assignments.length}`} />
        <StatCard
          icon={CalendarX2}
          tone={missed ? "danger" : "success"}
          label="Missed deadlines"
          value={missed}
          note={missed ? "Deadline passed without a submission" : "None missed"}
        />
        <StatCard
          icon={TrendingDown}
          tone={gaps.length ? "warning" : "success"}
          label="Learning gaps"
          value={gaps.length}
          note={gaps.length ? gaps.map((gap) => gap.topic).join(", ") : `Topics below ${pct(progress.gap_threshold)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Score trend"
          subtitle="Published score per assignment, by deadline"
          table={progress.trend.length ? <TrendTable items={progress.trend} /> : undefined}
        >
          <TrendChart items={progress.trend} threshold={progress.gap_threshold} height={260} />
        </ChartCard>
        <ChartCard
          title="Topic mastery"
          subtitle={`${you ? "Your" : "Their"} marks per topic`}
          table={progress.topics.length ? <MasteryTable items={progress.topics} /> : undefined}
        >
          <TopicRadar items={progress.topics} threshold={progress.gap_threshold} />
        </ChartCard>
      </div>

      {progress.topics.length >= 3 ? (
        <ChartCard title="Topics to focus on" subtitle="Weakest first. Red bars are below the learning-gap line.">
          <MasteryBars items={progress.topics} threshold={progress.gap_threshold} limit={5} />
        </ChartCard>
      ) : null}

      <Card padded={false}>
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <CardHeader
            title="Assignments"
            description={`Only published grades count. ${plural(progress.trend.length, "graded assignment")} so far.`}
          />
        </div>
        {progress.assignments.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState compact icon={ListChecks} title="No assignments yet" />
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {progress.assignments.map((assignment) => {
              const state = STATE[assignment.state];
              return (
                <li key={assignment.assignment_id}>
                  <Link
                    className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:px-6"
                    href={`/courses/${courseId}/assignments/${assignment.assignment_id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{assignment.title}</p>
                      <p className="text-xs text-muted">Due {new Date(assignment.deadline).toLocaleDateString()}</p>
                    </div>
                    <Badge tone={state.tone} icon={state.icon}>
                      {state.label}
                    </Badge>
                    <span className="w-12 text-right text-sm font-semibold text-fg tabular-nums">{pct(assignment.score)}</span>
                    <ArrowRight size={15} className="text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
