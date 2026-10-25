"use client";

import { LineChart as LineIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { axisProps, ChartTooltip, pct, tableClass, tdClass, thClass } from "@/components/charts/ChartParts";
import { EmptyState } from "@/components/ui/States";

export type TrendItem = {
  assignment_id: string;
  title: string;
  deadline: string;
  earned: number;
  possible: number;
  score: number; // 0..1
};

/** Score per assignment over time: one 2px line, ringed markers, crosshair tooltip. */
export function TrendChart({
  items,
  threshold,
  height = 220,
  compact,
}: {
  items: TrendItem[];
  threshold?: number;
  height?: number;
  /** Sparkline-style: no axes, used on the dashboard. */
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState compact icon={LineIcon} title="No published grades yet" body="The trend appears after the first grade is published." />;
  }

  const data = items.map((item) => ({ ...item, short: truncate(item.title, 16) }));

  return (
    <div style={{ height }} role="img" aria-label={`Score trend: ${items.map((i) => `${i.title} ${pct(i.score)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={compact ? { top: 6, right: 6, bottom: 0, left: 6 } : { top: 10, right: 16, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-series-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--viz-series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {!compact ? <CartesianGrid vertical={false} stroke="var(--viz-grid)" /> : null}
          <XAxis dataKey="short" hide={compact} {...axisProps} interval="preserveStartEnd" tickMargin={8} />
          <YAxis
            hide={compact}
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => pct(v)}
            width={44}
            {...axisProps}
          />
          {threshold !== undefined && !compact ? (
            <ReferenceLine y={threshold} stroke="var(--viz-critical)" strokeDasharray="4 4" strokeOpacity={0.6} />
          ) : null}
          <Tooltip
            cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const item = active && payload?.[0]?.payload as (typeof data)[number] | undefined;
              return item ? (
                <ChartTooltip
                  title={item.title}
                  rows={[
                    { label: "Score", value: pct(item.score, 1), color: "var(--viz-series-1)" },
                    { label: "Marks", value: `${item.earned} / ${item.possible}` },
                    { label: "Due", value: new Date(item.deadline).toLocaleDateString() },
                  ]}
                />
              ) : null;
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
            fill="url(#trend-fill)"
            dot={{ r: 4, fill: "var(--viz-series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "var(--viz-series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendTable({ items }: { items: TrendItem[] }) {
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th className={thClass}>Assignment</th>
          <th className={thClass}>Deadline</th>
          <th className={thClass}>Marks</th>
          <th className={thClass}>Score</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.assignment_id}>
            <td className={tdClass}>{item.title}</td>
            <td className={tdClass}>{new Date(item.deadline).toLocaleDateString()}</td>
            <td className={tdClass}>
              {item.earned} / {item.possible}
            </td>
            <td className={tdClass}>{pct(item.score, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
