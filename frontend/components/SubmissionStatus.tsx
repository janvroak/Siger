import type { RosterState } from "@/lib/api";

// Literal class names so Tailwind can see them at build time.
const STYLE: Record<RosterState, string> = {
  not_submitted: "border-slate-200 bg-slate-50 text-slate-600",
  overdue: "border-red-200 bg-red-50 text-red-700",
  submitted: "border-sky-200 bg-sky-50 text-sky-700",
  evaluating: "border-violet-200 bg-violet-50 text-violet-700",
  under_review: "border-amber-200 bg-amber-50 text-amber-800",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

/** Faculty wording. */
const FACULTY_LABEL: Record<RosterState, string> = {
  not_submitted: "Not submitted",
  overdue: "Overdue",
  submitted: "Submitted",
  evaluating: "AI grading",
  under_review: "Needs review",
  published: "Published",
  failed: "Grading failed",
};

/** Student wording: AI marks stay hidden until faculty publish them. */
const STUDENT_LABEL: Record<RosterState, string> = {
  not_submitted: "Not submitted",
  overdue: "Missed",
  submitted: "Submitted",
  evaluating: "Being graded",
  under_review: "Being graded",
  published: "Graded",
  failed: "Being graded",
};

export function StatusBadge({
  state,
  audience,
}: {
  state: RosterState;
  audience: "student" | "faculty";
}) {
  // Students don't see the review/failure stages as separate states.
  const shown: RosterState =
    audience === "student" && (state === "under_review" || state === "failed")
      ? "evaluating"
      : state;
  const label = (audience === "student" ? STUDENT_LABEL : FACULTY_LABEL)[state];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STYLE[shown]}`}>
      {label}
    </span>
  );
}
