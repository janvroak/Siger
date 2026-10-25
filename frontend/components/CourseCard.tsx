import { ReactNode } from "react";

import type { Course } from "@/lib/api";

// Literal class names so Tailwind can see them at build time. Muted, distinct
// tints so courses are easy to tell apart without competing with the accent.
const ACCENTS = [
  { soft: "bg-[#e7f4f2] text-[#0f5f58] dark:bg-[#0f2a28] dark:text-[#5eead4]" },
  { soft: "bg-[#eef3fd] text-[#1e40af] dark:bg-[#131d33] dark:text-[#93b4fb]" },
  { soft: "bg-[#f4effc] text-[#5b3aa8] dark:bg-[#211a33] dark:text-[#c4b0f5]" },
  { soft: "bg-[#fdf3e7] text-[#92400e] dark:bg-[#2a2010] dark:text-[#fbbf24]" },
  { soft: "bg-[#fcedf1] text-[#9f1239] dark:bg-[#2c1420] dark:text-[#fda4b8]" },
  { soft: "bg-[#ecf6ee] text-[#166534] dark:bg-[#10241a] dark:text-[#86efac]" },
];

/** A stable colour per course code, so a course looks the same everywhere. */
export function courseAccent(code: string) {
  let hash = 0;
  for (const char of code) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return ACCENTS[hash % ACCENTS.length];
}

type CourseCardProps = {
  course: Course;
  /** Small facts shown under the description, e.g. "12 students". */
  meta: ReactNode[];
  actions: ReactNode;
};

export function CourseCard({ course, meta, actions }: CourseCardProps) {
  const accent = courseAccent(course.code);

  return (
    <article className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 min-w-10 items-center justify-center rounded-lg px-2 font-display text-xs font-bold ${accent.soft}`}>
          {course.code}
        </span>
        <span className="text-xs text-muted">{course.semester}</span>
      </div>
      <h3 className="mt-4 text-base leading-snug font-semibold text-fg">{course.title}</h3>
      <p className="mt-0.5 text-sm text-muted">{course.professor_name}</p>
      <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted">{course.description}</p>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {meta.map((item, index) => (
          <span key={index} className="inline-flex items-center gap-1">
            {index > 0 ? <span className="text-subtle" aria-hidden>·</span> : null}
            {item}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">{actions}</div>
    </article>
  );
}

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
