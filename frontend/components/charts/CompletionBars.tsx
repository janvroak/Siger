"use client";

import { ClipboardList } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { axisProps, ChartTooltip, LegendItem, pct, tableClass, tdClass, thClass } from "@/components/charts/ChartParts";
import { EmptyState } from "@/components/ui/States";

export type CompletionItem = {
  assignment_id: string;
  title: string;
  deadline: string;
  enrolled: number;
  submitted: number;
  pending: number;
  overdue: number;
  published: number;
  rate: number;
  average_score: number | null;
};

const SEGMENTS = [
  { key: "submitted", label: "Submitted", color: "var(--viz-series-1)" },
  { key: "pending", label: "Not yet due", color: "var(--viz-track)" },
  { key: "overdue", label: "Overdue", color: "var(--viz-critical)" },
] as const;

export function CompletionLegend() {
  return (
    <div className="flex flex-wrap gap-4">
      {SEGMENTS.map((segment) => (
        <LegendItem key={segment.key} color={segment.color} label={segment.label} />
      ))}
    </div>
  );
}

function NoAssignments() {
  return <EmptyState compact icon={ClipboardList} title="No assignments yet" />;
}

/** Overall completion donut with the rate in the middle; the legend shows the counts. */
export function CompletionDonut({ items, rate }: { items: CompletionItem[]; rate: number | null }) {
  if (items.length === 0) {
    return <NoAssignments />;
  }
  const totals = SEGMENTS.map((segment) => ({
    ...segment,
    value: items.reduce((sum, item) => sum + item[segment.key], 0),
  }));
  const all = totals.reduce((sum, t) => sum + t.value, 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={totals.filter((t) => t.value > 0)}
              dataKey="value"
              nameKey="label"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={2}
              cornerRadius={4}
              stroke="var(--viz-surface)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              animationDuration={600}
            >
              {totals
                .filter((t) => t.value > 0)
                .map((t) => (
                  <Cell key={t.key} fill={t.color} />
                ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const t = active && (payload?.[0]?.payload as (typeof totals)[number] | undefined);
                return t ? (
                  <ChartTooltip title={t.label} rows={[{ label: "Submissions", value: `${t.value} of ${all}`, color: t.color }]} />
                ) : null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-fg tabular-nums">{pct(rate)}</span>
          <span className="text-[11px] text-muted">complete</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {totals.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3">
            <LegendItem color={t.color} label={t.label} />
            <span className="font-semibold text-fg tabular-nums">{t.value}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 border-t border-line pt-2 text-xs text-muted">
          <span>Student × assignment slots</span>
          <span className="tabular-nums">{all}</span>
        </li>
      </ul>
    </div>
  );
}

/** One stacked bar per assignment: submitted / not yet due / overdue students. */
export function CompletionBars({ items }: { items: CompletionItem[] }) {
  if (items.length === 0) {
    return <NoAssignments />;
  }
  const data = items.map((item) => ({ ...item, short: item.title.length > 20 ? `${item.title.slice(0, 19)}…` : item.title }));
  return (
    <div style={{ height: Math.max(items.length * 44 + 16, 120) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="short" width={170} {...axisProps} tick={{ fill: "var(--viz-text-secondary)", fontSize: 12, width: 400 }} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const item = active && (payload?.[0]?.payload as CompletionItem | undefined);
              return item ? (
                <ChartTooltip
                  title={item.title}
                  rows={[
                    ...SEGMENTS.map((s) => ({ label: s.label, value: `${item[s.key]} of ${item.enrolled}`, color: s.color })),
                    { label: "Due", value: new Date(item.deadline).toLocaleDateString() },
                  ]}
                />
              ) : null;
            }}
          />
          {SEGMENTS.map((segment, index) => (
            <Bar
              key={segment.key}
              dataKey={segment.key}
              stackId="completion"
              fill={segment.color}
              stroke="var(--viz-surface)"
              strokeWidth={2}
              radius={index === SEGMENTS.length - 1 ? [0, 4, 4, 0] : 0}
              animationDuration={600}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompletionTable({ items }: { items: CompletionItem[] }) {
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th className={thClass}>Assignment</th>
          <th className={thClass}>Deadline</th>
          <th className={thClass}>Submitted</th>
          <th className={thClass}>Not yet due</th>
          <th className={thClass}>Overdue</th>
          <th className={thClass}>Published</th>
          <th className={thClass}>Average score</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.assignment_id}>
            <td className={tdClass}>{item.title}</td>
            <td className={tdClass}>{new Date(item.deadline).toLocaleDateString()}</td>
            <td className={tdClass}>
              {item.submitted} / {item.enrolled} ({pct(item.rate)})
            </td>
            <td className={tdClass}>{item.pending}</td>
            <td className={tdClass}>{item.overdue}</td>
            <td className={tdClass}>{item.published}</td>
            <td className={tdClass}>{pct(item.average_score, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
