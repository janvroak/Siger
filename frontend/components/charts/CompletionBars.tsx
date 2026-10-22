"use client";

import { useState } from "react";

import { LegendItem, pct, tableClass, tdClass, thClass } from "@/components/charts/ChartParts";

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

/** One stacked bar per assignment: submitted / not yet due / overdue students. */
export function CompletionBars({ items }: { items: CompletionItem[] }) {
  const [hover, setHover] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No assignments yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.assignment_id}
          className="grid grid-cols-[1fr_6.5rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(7rem,11rem)_1fr_7rem]"
        >
          <div className="col-span-2 min-w-0 text-sm sm:col-span-1">
            <p className="truncate" style={{ color: "var(--viz-text-primary)" }} title={item.title}>
              {item.title}
            </p>
            <p className="text-[11px]" style={{ color: "var(--viz-text-muted)" }}>
              due {new Date(item.deadline).toLocaleDateString()}
            </p>
          </div>
          <div className="relative flex h-[14px] gap-[2px]">
            {item.enrolled === 0 ? (
              <div className="h-full w-full rounded-r-[4px]" style={{ background: "var(--viz-track)" }} />
            ) : (
              SEGMENTS.filter((segment) => item[segment.key] > 0).map((segment, index, shown) => {
                const id = `${item.assignment_id}:${segment.key}`;
                return (
                  <div
                    key={segment.key}
                    className={`relative h-full ${index === shown.length - 1 ? "rounded-r-[4px]" : ""}`}
                    style={{
                      flexGrow: item[segment.key],
                      flexBasis: 0,
                      background: segment.color,
                      outline: hover === id ? "2px solid rgba(11,11,11,0.25)" : undefined,
                    }}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {hover === id ? (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
                      >
                        <p className="font-medium">{item.title}</p>
                        <p style={{ color: "var(--viz-text-secondary)" }}>
                          {segment.label}: {item[segment.key]} of {item.enrolled} students
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <div className="text-right text-sm whitespace-nowrap tabular-nums" style={{ color: "var(--viz-text-primary)" }}>
            {item.submitted}/{item.enrolled}
            {item.overdue > 0 ? (
              <span className="ml-1.5 text-xs" style={{ color: "var(--viz-text-secondary)" }}>
                <span aria-hidden style={{ color: "var(--viz-critical)" }}>
                  ▲
                </span>{" "}
                {item.overdue} late
              </span>
            ) : null}
          </div>
        </div>
      ))}
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
