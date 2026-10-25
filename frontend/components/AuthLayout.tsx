import { BarChart3, MessagesSquare, ShieldCheck } from "lucide-react";
import { ReactNode } from "react";

import { Logo } from "@/components/AppShell";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Grades you can explain",
    body: "Every AI mark comes with key points, a rationale and a confidence score, and nothing is published until faculty approve it.",
  },
  {
    icon: BarChart3,
    title: "Analytics from real numbers",
    body: "Topic mastery, completion and learning gaps are computed in SQL, so every figure can be traced.",
  },
  {
    icon: MessagesSquare,
    title: "A tutor that stays on topic",
    body: "Students ask questions about the course slides and get answers with page citations.",
  },
];

/** Split screen: brand panel (hidden on small screens) beside the form. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#0b2a27] p-12 text-white lg:flex lg:flex-col">
        {/* Quiet grid texture, not a gradient wash. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <Logo size={34} />
          <span className="font-display text-lg font-bold tracking-tight">Siger</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h2 className="font-display text-[34px] leading-[1.15] font-bold tracking-tight">
            Assessment that shows its work.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            AI grading against your answer key, faculty review before anything is published, and learning analytics
            for the whole class.
          </p>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#5eead4]">
                  <Icon size={17} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/60">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">Student and faculty portals · role-based access</p>
      </aside>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={32} />
            <span className="font-display text-lg font-bold tracking-tight text-fg">Siger</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

export { PasswordInput } from "@/components/PasswordInput";
