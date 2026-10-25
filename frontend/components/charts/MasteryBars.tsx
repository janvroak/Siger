"use client";

import { Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { axisProps, ChartTooltip, GapBadge, LegendItem, pct, tableClass, tdClass, thClass } from "@/components/charts/ChartParts";
import { EmptyState } from "@/components/ui/States";

export type MasteryItem = {
  topic: string;
  mastery: number; // 0..1
  earned: number;
  possible: number;
  graded_answers: number;
  is_gap: boolean;
};

function NoMastery() {
  return (
    <EmptyState
      compact
      icon={Target}
      title="No published grades yet"
      body="Topic mastery appears once graded work is published."
    />
  );
}

function masteryRows(item: MasteryItem) {
  return [
    { label: "Mastery", value: pct(item.mastery, 1) },
    { label: "Marks", value: `${item.earned} / ${item.possible}` },
    { label: "Graded answers", value: item.graded_answers },
  ];
}

/**
 * Horizontal bars, weakest first, with the learning-gap threshold drawn as a
 * hairline. Gaps are red and carry an icon + word, never colour alone.
 */
export function MasteryBars({ items, threshold, limit }: { items: MasteryItem[]; threshold: number; limit?: number }) {
  if (items.length === 0) {
    return <NoMastery />;
  }
  const shown = limit ? items.slice(0, limit) : items;

  return (
    <div>
      <ul className="space-y-3.5">
        {shown.map((item) => (
          <li key={item.topic} className="group" title={`${item.topic}: ${pct(item.mastery, 1)} · ${item.earned} of ${item.possible} marks`}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-fg">{item.topic}</span>
                {item.is_gap ? <GapBadge /> : null}
              </span>
              <span className="shrink-0 font-semibold text-fg tabular-nums">{pct(item.mastery)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-[var(--viz-track)]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out group-hover:brightness-110"
                style={{
                  width: `${Math.max(item.mastery * 100, 1.5)}%`,
                  background: item.is_gap ? "var(--viz-critical)" : "var(--viz-series-1)",
                }}
              />
              <div
                aria-hidden
                className="absolute -top-1 -bottom-1 w-px bg-[var(--viz-text-muted)]"
                style={{ left: `${threshold * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-block h-3 w-px bg-[var(--viz-text-muted)]" aria-hidden />
        {pct(threshold)} learning-gap line
        {limit && items.length > limit ? <span className="ml-auto">{items.length - limit} more in the table</span> : null}
      </p>
    </div>
  );
}

/** Column chart of every topic (class averages). */
export function TopicColumns({ items, threshold, height = 240 }: { items: MasteryItem[]; threshold: number; height?: number }) {
  if (items.length === 0) {
    return <NoMastery />;
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4">
        <LegendItem color="var(--viz-series-1)" label="On track" />
        <LegendItem color="var(--viz-critical)" label={`Learning gap (below ${pct(threshold)})`} />
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="topic" {...axisProps} interval={0} tickMargin={8} tickFormatter={(t: string) => (t.length > 14 ? `${t.slice(0, 13)}…` : t)} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => pct(v)} width={44} {...axisProps} />
            <ReferenceLine y={threshold} stroke="var(--viz-critical)" strokeDasharray="4 4" strokeOpacity={0.6} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) => {
                const item = active && (payload?.[0]?.payload as MasteryItem | undefined);
                return item ? (
                  <ChartTooltip title={<span className="flex items-center gap-2">{item.topic}{item.is_gap ? <GapBadge /> : null}</span>} rows={masteryRows(item)} />
                ) : null;
              }}
            />
            <Bar dataKey="mastery" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={600}>
              {items.map((item) => (
                <Cell key={item.topic} fill={item.is_gap ? "var(--viz-critical)" : "var(--viz-series-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Radar of topic mastery; falls back to bars when there are too few topics for a shape. */
export function TopicRadar({ items, threshold, height = 260 }: { items: MasteryItem[]; threshold: number; height?: number }) {
  if (items.length < 3) {
    return <MasteryBars items={items} threshold={threshold} />;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={items} outerRadius="72%">
          <PolarGrid stroke="var(--viz-grid)" />
          <PolarAngleAxis
            dataKey="topic"
            tick={{ fill: "var(--viz-text-secondary)", fontSize: 11 }}
            tickFormatter={(t: string) => (t.length > 16 ? `${t.slice(0, 15)}…` : t)}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              const item = active && (payload?.[0]?.payload as MasteryItem | undefined);
              return item ? (
                <ChartTooltip title={<span className="flex items-center gap-2">{item.topic}{item.is_gap ? <GapBadge /> : null}</span>} rows={masteryRows(item)} />
              ) : null;
            }}
          />
          <Radar
            dataKey="mastery"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
            fill="var(--viz-series-1)"
            fillOpacity={0.18}
            dot={{ r: 3.5, fill: "var(--viz-series-1)", stroke: "var(--viz-surface)", strokeWidth: 1.5 }}
            animationDuration={600}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MasteryTable({ items }: { items: MasteryItem[] }) {
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th className={thClass}>Topic</th>
          <th className={thClass}>Mastery</th>
          <th className={thClass}>Marks</th>
          <th className={thClass}>Graded answers</th>
          <th className={thClass}>Learning gap</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.topic}>
            <td className={tdClass}>{item.topic}</td>
            <td className={tdClass}>{pct(item.mastery, 1)}</td>
            <td className={tdClass}>
              {item.earned} / {item.possible}
            </td>
            <td className={tdClass}>{item.graded_answers}</td>
            <td className={tdClass}>{item.is_gap ? "Yes" : "No"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
