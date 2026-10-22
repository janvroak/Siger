import { ReactNode } from "react";

import type { Course } from "@/lib/api";

// Literal class names so Tailwind can see them at build time.
const ACCENTS = [
  { band: "from-indigo-500 to-violet-500", soft: "bg-indigo-100 text-indigo-700" },
  { band: "from-sky-500 to-cyan-500", soft: "bg-sky-100 text-sky-700" },
  { band: "from-emerald-500 to-teal-500", soft: "bg-emerald-100 text-emerald-700" },
  { band: "from-amber-500 to-orange-500", soft: "bg-amber-100 text-amber-700" },
  { band: "from-rose-500 to-pink-500", soft: "bg-rose-100 text-rose-700" },
  { band: "from-fuchsia-500 to-purple-500", soft: "bg-fuchsia-100 text-fuchsia-700" },
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
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className={`h-2 bg-gradient-to-r ${accent.band}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${accent.soft}`}>
            {course.code}
          </span>
          <span className="text-xs text-slate-500">{course.semester}</span>
        </div>
        <h3 className="mt-3 text-lg font-semibold leading-snug">{course.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{course.professor_name}</p>
        <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600">{course.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {meta.map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{actions}</div>
      </div>
    </article>
  );
}

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
