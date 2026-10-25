# SIGER frontend

The student and faculty portals: a Next.js 16 (App Router) app with
React 19, Tailwind CSS v4, Recharts and lucide-react icons.

See the [root README](../README.md) to run the whole system and
[docs/architecture.md](../docs/architecture.md#10-frontend) for the route map.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 (the API must be running on :8000)
npm run lint
npm run build
```

`/api/backend/*` is forwarded to the FastAPI backend (`next.config.ts`).
Set `BACKEND_API_URL` when the API runs somewhere other than
`http://127.0.0.1:8000`.

## Structure

```
app/                      pages (App Router); every page is a client component
├── login/, register/
├── dashboard/            student or faculty home, by role
└── courses/[courseId]/
    ├── chat/                                 lecture chatbot (students)
    ├── analytics/                            class analytics / my progress
    │   └── students/[studentId]/             one student's progress (faculty)
    └── assignments/
        ├── new/                              create assignment + answer key
        └── [assignmentId]/
            ├── edit/
            └── submissions/[submissionId]/   faculty review screen
components/
├── ui/                   design system (see below)
├── charts/               Recharts charts, each with a table view
├── AppShell.tsx          sidebar, top bar, Ctrl+K search, theme toggle, user menu
├── ClassDashboard.tsx    faculty analytics
├── StudentDashboard.tsx  student progress
├── QuestionResultCard.tsx, GradeView.tsx, SubmissionPanel.tsx, RosterPanel.tsx …
lib/
├── api.ts                the only module that calls the backend; all types
├── auth.ts               JWT in localStorage
├── useAuthedUser.ts      signed-in user + role redirect
└── preferences.ts        theme and sidebar preferences
```

## Conventions

- **Data:** call the backend only through functions in `lib/api.ts`. Pages
  load with `useAuthedUser()` and pass the token to those functions.
- **Styling:** use the design tokens, not raw Tailwind colours:
  `bg-surface`, `bg-surface-2`, `border-line`, `text-fg`, `text-muted`,
  `bg-accent`, `text-accent-text`, and `success` / `warning` / `danger` /
  `info` (each with `-soft` and `-line`). They are defined in
  `app/globals.css` for light and dark mode, so dark mode needs no extra
  classes.
- **Components:** reuse `components/ui`:

  | Component | For |
  |---|---|
  | `Button`, `IconButton`, `buttonClass()` | actions; `buttonClass` styles links as buttons |
  | `Field`, `inputClass`, `Select` | form fields with label, hint and error |
  | `Card`, `CardHeader`, `Page`, `PageHeader`, `Section` | page structure |
  | `Badge`, `Tag`, `PointChip` | statuses (always with an icon), topics, key points |
  | `StatCard`, `ScoreRing`, `ScoreChip`, `ConfidenceMeter`, `ProgressBar` | numbers and scores |
  | `StatusStepper` | submission progress |
  | `DataTable` | tables with sticky header and sortable columns |
  | `Tabs`, `Modal` (in `components/`), `Toast` (`useToast()`) | interaction |
  | `Skeleton`, `PageSkeleton`, `EmptyState`, `ErrorState`, `Callout` | loading, empty and error states |
  | `Dropzone` | drag-and-drop PDF upload |

- **Accessibility:** status is never colour alone (icon or text too), every
  icon-only button has a label, and LLM or student text is always rendered as
  plain text, never as HTML.
- **Next.js version:** this is Next.js 16, which differs from older versions;
  check `node_modules/next/dist/docs/` before using an unfamiliar API
  (see `AGENTS.md`).
