"use client";

import { useState } from "react";

import { pct, tableClass, tdClass, thClass, Tooltip, useWidth } from "@/components/charts/ChartParts";

export type TrendItem = {
  assignment_id: string;
  title: string;
  deadline: string;
  earned: number;
  possible: number;
  score: number; // 0..1
};

const HEIGHT = 200;
const PAD = { top: 16, right: 48, bottom: 28, left: 40 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];

/** Score per assignment over time: one 2px line, ringed markers, crosshair hover. */
export function TrendChart({ items }: { items: TrendItem[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No published grades yet.</p>;
  }

  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (items.length === 1 ? plotWidth / 2 : (i / (items.length - 1)) * plotWidth);
  const y = (score: number) => PAD.top + (1 - score) * plotHeight;
  const path = items.map((item, i) => `${i ? "L" : "M"}${x(i)},${y(item.score)}`).join(" ");
  const last = items.length - 1;

  function nearest(clientX: number, rectLeft: number) {
    const px = clientX - rectLeft;
    let best = 0;
    items.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    return best;
  }

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Score per assignment over time"
          onMouseMove={(event) =>
            setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect().left))
          }
          onMouseLeave={() => setHover(null)}
        >
          {TICKS.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--viz-text-muted)"
              >
                {pct(tick)}
              </text>
            </g>
          ))}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          ) : null}
          <path
            d={`${path} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`}
            fill="var(--viz-series-1)"
            opacity={0.1}
          />
          <path
            d={path}
            fill="none"
            stroke="var(--viz-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {items.map((item, i) => (
            <circle
              key={item.assignment_id}
              cx={x(i)}
              cy={y(item.score)}
              r={hover === i ? 5.5 : 4}
              fill="var(--viz-series-1)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          ))}
          {/* label the endpoint only */}
          <text
            x={x(last) + 10}
            y={y(items[last].score)}
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={600}
            fill="var(--viz-text-primary)"
          >
            {pct(items[last].score)}
          </text>
          {items.map((item, i) => (
            <text
              key={`label-${item.assignment_id}`}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor={items.length === 1 ? "middle" : i === 0 ? "start" : i === last ? "end" : "middle"}
              fontSize={11}
              fill="var(--viz-text-muted)"
            >
              {items.length <= 6 || i === 0 || i === last ? truncate(item.title, 18) : ""}
            </text>
          ))}
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      {hover !== null && width > 0 ? (
        <Tooltip x={x(hover)} y={y(items[hover].score)}>
          <p className="font-medium">{items[hover].title}</p>
          <p style={{ color: "var(--viz-text-secondary)" }}>
            {pct(items[hover].score, 1)} · {items[hover].earned} of {items[hover].possible} marks
          </p>
          <p style={{ color: "var(--viz-text-muted)" }}>
            due {new Date(items[hover].deadline).toLocaleDateString()}
          </p>
        </Tooltip>
      ) : null}
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
