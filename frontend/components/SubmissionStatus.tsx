import {
  AlertOctagon,
  CheckCircle2,
  CircleDashed,
  Clock,
  Eye,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge, type Tone } from "@/components/ui/Badge";
import type { RosterState } from "@/lib/api";

const STYLE: Record<RosterState, { tone: Tone; icon: LucideIcon; pulse?: boolean }> = {
  not_submitted: { tone: "neutral", icon: CircleDashed },
  overdue: { tone: "danger", icon: XCircle },
  submitted: { tone: "info", icon: Send },
  evaluating: { tone: "accent", icon: Clock, pulse: true },
  under_review: { tone: "warning", icon: Eye },
  published: { tone: "success", icon: CheckCircle2 },
  failed: { tone: "danger", icon: AlertOctagon },
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
  const style = STYLE[shown];
  return (
    <Badge tone={style.tone} icon={style.icon} pulse={style.pulse}>
      {label}
    </Badge>
  );
}
