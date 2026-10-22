"use client";

import { useState } from "react";

import { GapBadge, pct, tableClass, tdClass, thClass } from "@/components/charts/ChartParts";

export type MasteryItem = {
  topic: string;
  mastery: number; // 0..1
  earned: number;
  possible: number;
  graded_answers: number;
  is_gap: boolean;
};

/**
 * Horizontal bars, one hue (magnitude), weakest first, with the learning-gap
 * threshold drawn as a hairline. Gaps carry an icon + word, never color alone.
 */
export function MasteryBars({ items, threshold }: { items: MasteryItem[]; threshold: number }) {
  const [hover, setHover] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No published grades yet. Topic mastery appears once graded work is published.
      </p>
    );
  }

  return (
    <div className="relative">
      <div className="space-y-2.5">
        {items.map((item, index) => (
          <div
            key={item.topic}
            className="grid grid-cols-[1fr_3.5rem] items-center gap-x-3 gap-y-1 rounded-md sm:grid-cols-[minmax(7rem,11rem)_1fr_3.5rem]"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            style={{ background: hover === index ? "rgba(11,11,11,0.03)" : undefined }}
          >
            <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-sm sm:col-span-1">
              <span className="truncate" style={{ color: "var(--viz-text-primary)" }} title={item.topic}>
                {item.topic}
              </span>
              {item.is_gap ? <GapBadge /> : null}
            </div>
            <div className="relative h-[14px]">
              {/* recessive track keeps the 0-100% scale readable */}
              <div className="absolute inset-0 rounded-r-[4px]" style={{ background: "#f4f3ef" }} />
              <div
                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{
                  width: `${Math.max(item.mastery * 100, 0.5)}%`,
                  background: "var(--viz-series-1)",
                }}
              />
              <div
                aria-hidden
                className="absolute -inset-y-1 w-px"
                style={{ left: `${threshold * 100}%`, background: "var(--viz-text-muted)" }}
              />
              {hover === index ? (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
                  style={{ left: `${Math.min(Math.max(item.mastery * 100, 15), 85)}%` }}
                >
                  <p className="font-medium">{item.topic}</p>
                  <p style={{ color: "var(--viz-text-secondary)" }}>
                    {pct(item.mastery, 1)} mastery · {item.earned} of {item.possible} marks ·{" "}
                    {item.graded_answers} graded answer{item.graded_answers === 1 ? "" : "s"}
                  </p>
                </div>
              ) : null}
            </div>
            <span className="text-right text-sm tabular-nums" style={{ color: "var(--viz-text-primary)" }}>
              {pct(item.mastery)}
            </span>
          </div>
        ))}
      </div>
      <div
        className="mt-3 grid grid-cols-[1fr_3.5rem] gap-3 text-[11px] sm:grid-cols-[minmax(7rem,11rem)_1fr_3.5rem]"
        style={{ color: "var(--viz-text-muted)" }}
      >
        <span className="hidden sm:block" />
        <div className="relative h-4">
          <span className="absolute left-0">0%</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${threshold * 100}%` }}>
            {pct(threshold)}
            <span className="hidden sm:inline"> gap line</span>
          </span>
          <span className="absolute right-0">100%</span>
        </div>
        <span />
      </div>
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
