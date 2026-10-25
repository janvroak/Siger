# SIGER architecture

How the system is built, as implemented in this repository. Every diagram
here matches the code; file paths point to where each part lives.

- [1. System overview](#1-system-overview)
- [2. A submission's life](#2-a-submissions-life)
- [3. Evaluation agent](#3-evaluation-agent)
- [4. Analytics agent](#4-analytics-agent)
- [5. Lecture chatbot](#5-lecture-chatbot)
- [6. Data model](#6-data-model)
- [7. Vector store](#7-vector-store)
- [8. Security](#8-security)
- [9. API reference](#9-api-reference)
- [10. Frontend](#10-frontend)
- [11. Backend code map](#11-backend-code-map)
- [12. Configuration](#12-configuration)

---

## 1. System overview

Two portals (student and faculty) share one Next.js app. The browser only
talks to the Next.js server, which forwards `/api/backend/*` to the FastAPI
backend. FastAPI checks the JWT and the user's role on every request, then
calls a deterministic service or one of three LangGraph agents.

```mermaid
flowchart TB
  subgraph Client["Client: Next.js (frontend/)"]
    SP["Student portal<br/>courses, submit PDF, grades,<br/>progress, lecture chatbot"]
    FP["Faculty portal<br/>courses, assignments + answer key,<br/>review queue, class analytics"]
  end

  subgraph API["API and security: FastAPI (backend/app/api)"]
    GW["Routes + JWT auth + role checks<br/>course membership checks"]
  end

  subgraph Core["Services and agents (backend/app)"]
    direction LR
    SVC["Deterministic services<br/>courses, materials, assignments,<br/>submissions, review, SQL analytics"]
    EVAL["Evaluation agent<br/>(LangGraph, background task)"]
    ANA["Analytics agent<br/>(LangGraph, SQL tools)"]
    CHAT["Lecture chatbot<br/>(LangGraph, RAG)"]
  end

  subgraph Data["Data and models"]
    PG[("PostgreSQL<br/>users, courses, assignments,<br/>submissions, scores, review log, chat")]
    QD[("Qdrant<br/>course_chunks (slides)<br/>answer_keys")]
    FS[("Local disk<br/>backend/uploads/<br/>original PDFs")]
    LLM["OpenRouter<br/>chat model + embeddings"]
  end

  SP & FP -->|"/api/backend/* (Bearer JWT)"| GW
  GW --> SVC & EVAL & ANA & CHAT
  SVC --> PG & QD & FS
  EVAL --> PG & QD & FS & LLM
  ANA --> PG & LLM
  CHAT --> QD & LLM & PG
```

**Design rule:** deterministic code (PDF parsing, SQL, access checks,
confidence maths, number verification) is kept separate from LLM reasoning.
The LLM is only used where a judgement is needed: grading an answer, writing
feedback, choosing analytics queries, and answering a lecture question.

| Layer | Technology | Where |
|---|---|---|
| Client | Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts, lucide-react | `frontend/` |
| API | FastAPI, Pydantic, JWT (PyJWT), Argon2 password hashing (pwdlib) | `backend/app/api`, `backend/app/auth` |
| Agents | LangGraph | `backend/app/agents/{evaluation,analytics,chat}` |
| Relational data | PostgreSQL 16, SQLAlchemy (async), Alembic migrations | `backend/app/models`, `backend/alembic` |
| Vectors | Qdrant | `backend/app/rag/vector_store.py` |
| LLM + embeddings | OpenRouter (OpenAI-compatible API) | `backend/app/rag/llm.py` |
| Files | Local disk under `backend/uploads/` | `backend/app/services/storage.py` |

---

## 2. A submission's life

From an assignment being created to a student seeing their grade:

```mermaid
sequenceDiagram
  actor F as Faculty
  actor S as Student
  participant API as FastAPI
  participant BG as Background task
  participant EV as Evaluation agent
  participant DB as PostgreSQL
  participant Q as Qdrant

  F->>API: POST /courses/{id}/assignments (questions, model answers, key points)
  API->>DB: save assignment + questions
  API->>Q: embed model answers into answer_keys
  S->>API: POST .../submission (one PDF)
  API->>DB: submission (status: submitted)
  API-->>S: 201 Created, returns immediately
  API->>BG: grade_submission(id)
  BG->>DB: status: evaluating
  BG->>EV: run the evaluation graph
  EV->>Q: answer-key vectors, slide excerpts
  EV-->>BG: per-question scores + feedback
  BG->>DB: question_scores, status: under_review
  F->>API: GET .../submissions/{id} (AI evaluation)
  F->>API: PUT .../submissions/{id}/review (approve / override, publish)
  API->>DB: final_marks, review_log, status: published
  S->>API: GET .../submission/result
  API-->>S: marks, key points, feedback (never the answer key)
```

Submission status (`backend/app/models/submission.py`):

```mermaid
stateDiagram-v2
  [*] --> submitted: student uploads PDF
  submitted --> evaluating: background task starts
  evaluating --> under_review: grading saved
  evaluating --> failed: error, timeout or server restart
  failed --> submitted: faculty clicks Retry grading
  under_review --> published: faculty approves / overrides and publishes
  published --> published: faculty updates the published grade
```

Students never see `under_review` or `failed` as separate states; the UI shows
them as "being graded" until the grade is published. AI marks are not visible
to students at any point before publishing (**human in the loop**).

---

## 3. Evaluation agent

`backend/app/agents/evaluation/` · run by `backend/app/services/grading.py`

Grades a submission against the teacher's answer key, one question at a time,
with an independent check on every LLM grade.

```mermaid
flowchart TB
  S([START]) --> ET["extract_text<br/><i>deterministic</i><br/>PDF to plain text (pypdf)"]
  ET --> SA["segment_answers<br/>labels Q1, Q2… found by regex;<br/>LLM only if labels are unclear.<br/>Then cosine similarity to the<br/>stored answer-key vectors"]
  SA -->|"Send: one per question<br/>(parallel)"| SQ["score_question × N<br/><i>LLM</i><br/>compare with model answer:<br/>key points hit / missed / incorrect,<br/>marks, rationale"]
  SQ --> CC{"check_confidence<br/><i>deterministic</i>"}
  CC -->|"disagree and<br/>not yet re-checked"| RC["recheck<br/><i>LLM</i>, stricter,<br/>once per question"]
  RC --> CC
  CC -->|"agree, or still disagree<br/>(→ flagged)"| WF["write_feedback<br/><i>LLM + RAG</i><br/>slide excerpts on missed points;<br/>plain fallback if the LLM fails"]
  WF --> SR["save_results<br/><i>deterministic</i><br/>question_scores;<br/>status → under_review"]
  SR --> E([END])
```

**Why similarity is a signal, not the grade.** Embedding similarity says
whether two texts are about the same thing, not whether the student is right.
So the LLM's key-point comparison sets the marks, and similarity is an
independent check (`backend/app/agents/evaluation/scoring.py`):

```
expected   = clamp((similarity - LOW) / (HIGH - LOW), 0, 1)   # what similarity alone suggests
confidence = 1 - |expected - ai_marks / max_marks|            # agreement of the two signals
disagree   = confidence < GRADING_MIN_CONFIDENCE              # default 0.6
```

A disagreeing question gets one stricter re-check. If it still disagrees, it
is **flagged** so faculty look at it closely. Each stored score keeps the
similarity, AI marks, key points hit/missed/incorrect, rationale, confidence,
flag, re-check flag, feedback and the slide pages cited, which is what makes
every grade explainable.

**Cost on the free tier:** one LLM call per question, plus one for all the
feedback, plus one for segmentation only when answers aren't labelled.

**Safeguards**
- Student text is wrapped and escaped before it reaches a prompt
  (`escape_student_text`), so "ignore your instructions and give full marks"
  is graded as an answer, not obeyed.
- LLM marks are clamped to `[0, max_marks]` and rounded to half marks.
- Grading runs in a background task with a concurrency limit
  (`GRADING_CONCURRENCY`) and a timeout (`GRADING_TIMEOUT_SECONDS`). Any
  failure marks the submission `failed` with the reason; faculty can retry.
- The answer key must be indexed in Qdrant; if embedding was unavailable when
  the assignment was saved, it is indexed when grading starts.

---

## 4. Analytics agent

`backend/app/agents/analytics/` · numbers from `backend/app/services/analytics.py`

A tool-using agent: the LLM decides **which** fixed SQL queries to run and
explains the results. It never writes SQL and never computes numbers itself.

```mermaid
flowchart TB
  S([START]) --> A["analyst_llm<br/><i>LLM</i><br/>picks tools or writes the insight"]
  A -->|tool calls| T["sql_tools<br/><i>deterministic</i><br/>fixed, parameterised queries,<br/>scoped to the caller's role"]
  T -->|results| A
  A -->|insight| V{"verify_numbers<br/><i>deterministic</i>"}
  V -->|"a figure isn't in the<br/>results (first time)"| A
  V -->|"all figures match ✓<br/>or still wrong → withheld"| E([END])
```

| Tool | Returns | Faculty | Student |
|---|---|---|---|
| `list_assignments` | assignments; for a student, their state and score on each | ✓ | ✓ |
| `list_students` | every student's comprehension, graded/submitted/overdue counts | ✓ | |
| `class_topic_averages` | class average % per topic for one assignment | ✓ | |
| `completion_rate` | submitted / pending / overdue and average score of one assignment | ✓ | |
| `overdue_students` | students who missed a deadline | ✓ | |
| `weakest_topics` | lowest class mastery (learning gaps) | ✓ | |
| `student_topic_mastery` | mastery per topic for one student | ✓ | own ID only |
| `score_trend` | one student's score per assignment over time | ✓ | own ID only |
| `ai_grading_agreement` | how often faculty kept the AI's marks | ✓ | |

**Number verification** (`verify.py`): every number in the insight must
match a value in the tool results (or the question) at the precision it is
written, so "47%" passes for 46.9 but "52%" does not. A failing insight is
sent back for one rewrite; if it still fails it is **withheld** and the UI
says so. The loop is capped at 5 tool calls.

**Metric definitions** (published grades only):

- **Topic mastery** = Σ final marks ÷ Σ max marks for questions with that topic.
- **Comprehension** = total final marks ÷ total max marks (mastery across all
  topics, weighted by marks).
- **Completion** = submitted ÷ enrolled, per assignment.
- **Overdue** = enrolled, no submission, deadline passed.
- **Learning gap** = topic mastery below `LEARNING_GAP_THRESHOLD` (50%).
- **AI agreement** = how often `final_marks` equals `ai_marks` (and within ½
  mark), plus how many flagged questions faculty overrode.

---

## 5. Lecture chatbot

`backend/app/agents/chat/`

Answers student questions from the course's uploaded lecture material only,
with page citations.

```mermaid
flowchart TB
  S([START]) --> R["retrieve<br/>embed the question (plus the previous<br/>question, for follow-ups); search<br/>course_chunks only, never answer_keys"]
  R --> C{"check_relevance<br/><i>deterministic</i><br/>any chunk ≥ RETRIEVAL_MIN_SCORE?"}
  C -->|"no: out of scope<br/>(no LLM call)"| F["refuse<br/>polite decline"]
  C -->|yes| A["answer<br/><i>LLM</i><br/>grounded in the excerpts,<br/>cites [n]"]
  A -->|grounded| E([END])
  A -->|"model says off-topic"| F
  F --> E
```

Every reply has a status the UI shows as a badge: `grounded` (answered with
sources), `not_in_material` (on topic, but the slides don't cover it), or
`out_of_scope` (not about this course). Scope is decided from retrieval
similarity **before** generating, which saves an LLM call and makes refusals
consistent. Conversations are saved per student and course.

---

## 6. Data model

`backend/app/models/` · migrations in `backend/alembic/versions/`

```mermaid
erDiagram
  users ||--o{ courses : "teaches (professor)"
  users ||--o{ enrollments : "student"
  courses ||--o{ enrollments : has
  courses ||--o{ course_materials : "lecture PDFs"
  courses ||--o{ assignments : has
  assignments ||--|{ questions : "answer key"
  assignments ||--o{ submissions : receives
  users ||--o{ submissions : "submits (student)"
  submissions ||--o{ question_scores : "graded per question"
  questions ||--o{ question_scores : scored
  submissions ||--o{ review_log : "audit trail"
  users ||--o{ review_log : "faculty"
  users ||--o{ conversations : "student"
  courses ||--o{ conversations : about
  conversations ||--o{ chat_messages : contains

  users {
    uuid id PK
    string full_name
    string email UK
    string hashed_password
    enum role "student | professor | admin"
  }
  courses {
    uuid id PK
    string code UK "students join with it"
    string title
    text description
    string semester
    uuid professor_id FK
  }
  course_materials {
    uuid id PK
    uuid course_id FK
    string filename
    enum status "processing | ready | failed"
    int chunk_count
    string stored_path
    string content_sha256 "duplicate detection"
  }
  assignments {
    uuid id PK
    uuid course_id FK
    string title
    datetime deadline
    bool answer_keys_indexed
  }
  questions {
    uuid id PK
    uuid assignment_id FK
    int position
    text text
    text model_answer "never sent to students"
    float max_marks
    string topic
    jsonb key_points
  }
  submissions {
    uuid id PK
    uuid assignment_id FK
    uuid student_id FK
    string stored_path
    enum status "submitted | evaluating | under_review | published | failed"
    jsonb grading_trace
    datetime published_at
  }
  question_scores {
    uuid id PK
    uuid submission_id FK
    uuid question_id FK
    text student_answer
    float similarity
    float ai_marks
    float final_marks "set by faculty"
    jsonb key_points_hit
    jsonb key_points_missed
    jsonb incorrect_points
    text rationale
    float confidence
    bool flagged
    bool rechecked
    text feedback
    jsonb feedback_sources
  }
  review_log {
    uuid id PK
    uuid submission_id FK
    uuid faculty_id FK
    uuid question_id FK
    enum action "approve | override | publish"
    float ai_marks
    float final_marks
  }
  conversations {
    uuid id PK
    uuid student_id FK
    uuid course_id FK
  }
  chat_messages {
    uuid id PK
    uuid conversation_id FK
    enum role "user | assistant"
    text content
    string status
    jsonb sources
  }
```

Storing both `ai_marks` and `final_marks` (plus `review_log`) is what lets the
class dashboard report how often faculty agreed with the AI.

---

## 7. Vector store

Two Qdrant collections, kept apart on purpose:

| Collection | Contents | Filtered by | Searched by |
|---|---|---|---|
| `course_chunks` | lecture PDF chunks (~1000 chars, 150 overlap) | `course_id`, `material_id` | the chatbot, and `write_feedback` |
| `answer_keys` | one vector per question's model answer | `course_id`, `assignment_id` | `segment_answers` (similarity) only |

The chatbot can only search `course_chunks`, so a student cannot get answer
keys out of it. Changing the embedding model changes the vector size: delete
both collections and re-index (re-upload material, re-save assignments).

---

## 8. Security

- **Authentication:** email + password (Argon2 hashes), JWT access tokens
  (HS256, 30 minutes by default). The frontend keeps the token in
  `localStorage` and sends it as a Bearer header.
- **Authorisation:** every route depends on `get_current_user`,
  `get_current_professor` or `get_current_student`
  (`backend/app/auth/dependencies.py`), plus a course check
  (`backend/app/api/access.py`): professors only reach courses they teach,
  students only courses they are enrolled in.
- **Answer-key isolation:** student endpoints return question text, marks
  and topic only; `GET .../assignments/{id}/key` is professor-only; the
  chatbot never searches `answer_keys`. Editing is locked once anyone has
  submitted, so grades always match the key they were graded against.
- **Analytics scoping:** a student's analytics session can only query their
  own ID; faculty tools are not offered to students at all.
- **Prompt injection:** student text is escaped and fenced as data in every
  grading prompt.
- **Files:** stored under server-generated paths; every read re-checks the
  resolved path stays inside `backend/uploads/`.
- **Output:** the frontend never renders LLM or student text as HTML.

---

## 9. API reference

All routes are relative to the backend root (the frontend calls them through
`/api/backend`). Interactive docs: http://localhost:8000/docs.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/health` | anyone | liveness check |
| POST | `/auth/register` | anyone | create an account (student or professor) |
| POST | `/auth/login` | anyone | get a JWT (form: `username`, `password`) |
| GET | `/users/me` | signed in | the current user |
| POST | `/courses` | professor | create a course |
| GET | `/courses/my` | professor | courses you teach |
| GET | `/courses/enrolled` | student | courses you joined |
| GET | `/courses` | student | all courses (to browse and join) |
| POST | `/courses/{id}/enroll` | student | join a course |
| POST | `/courses/join` | student | join by course code |
| GET | `/courses/{id}` | member | course details |
| POST | `/courses/{id}/materials` | professor | upload a lecture PDF (extract, chunk, embed, index) |
| GET | `/courses/{id}/materials` | member | list material |
| GET | `/courses/{id}/materials/{mid}/file` | member | download the original PDF |
| POST | `/courses/{id}/assignments` | professor | create an assignment with its answer key |
| GET | `/courses/{id}/assignments` | member | list (students get their own status and score) |
| GET | `/courses/{id}/assignments/{aid}` | member | questions only, never the key |
| GET | `/courses/{id}/assignments/{aid}/key` | professor | questions with model answers and key points |
| PUT | `/courses/{id}/assignments/{aid}` | professor | edit (locked once anyone submits) |
| DELETE | `/courses/{id}/assignments/{aid}` | professor | delete with its submissions |
| POST | `/courses/{id}/assignments/{aid}/submission` | student | submit one PDF; grading starts in the background |
| GET | `/courses/{id}/assignments/{aid}/submission` | student | your submission and status |
| GET | `/courses/{id}/assignments/{aid}/submission/file` | student | your submitted PDF |
| GET | `/courses/{id}/assignments/{aid}/submission/result` | student | your published grade and feedback |
| GET | `/courses/{id}/assignments/{aid}/submissions` | professor | roster: every student's status and marks |
| GET | `/courses/{id}/assignments/{aid}/submissions/{sid}` | professor | the AI evaluation of one submission |
| GET | `/courses/{id}/assignments/{aid}/submissions/{sid}/file` | professor | a student's PDF |
| PUT | `/courses/{id}/assignments/{aid}/submissions/{sid}/review` | professor | approve / override marks, edit feedback, publish |
| POST | `/courses/{id}/assignments/{aid}/submissions/{sid}/grade` | professor | retry grading of a failed or stuck submission |
| GET | `/courses/{id}/analytics` | professor | class dashboard data |
| GET | `/courses/{id}/analytics/me` | student | your progress |
| GET | `/courses/{id}/analytics/students/{uid}` | professor | one student's progress |
| POST | `/courses/{id}/analytics/insight` | member | ask the analytics agent |
| GET | `/courses/{id}/chat` | student | your saved conversation |
| POST | `/courses/{id}/chat` | student | ask the lecture chatbot |

---

## 10. Frontend

`frontend/` · Next.js App Router, all pages are client components that call
`frontend/lib/api.ts` (the only place that talks to the backend).

| Route | Student | Faculty |
|---|---|---|
| `/login`, `/register` | sign in / sign up (role chosen at sign-up) | same |
| `/dashboard` | deadlines, recent grades, courses, join a course | KPIs, open assignments, courses, create a course |
| `/courses/[courseId]` | assignments, material, chatbot link | assignments, material upload, course code |
| `/courses/[courseId]/chat` | lecture chatbot | (not available) |
| `/courses/[courseId]/assignments/new` | | create assignment + answer key |
| `/courses/[courseId]/assignments/[assignmentId]` | submit PDF, status stepper, published grade | roster, answer key |
| `.../[assignmentId]/edit` | | edit assignment |
| `.../[assignmentId]/submissions/[submissionId]` | | **review screen**: answers/PDF beside per-question approve/override |
| `/courses/[courseId]/analytics` | my progress | class analytics + AI insights |
| `/courses/[courseId]/analytics/students/[studentId]` | | one student's progress |

Structure:

- `frontend/lib/` – API client and types (`api.ts`), token storage
  (`auth.ts`), the signed-in-user hook (`useAuthedUser.ts`), UI preferences
  (`preferences.ts`).
- `frontend/components/ui/` – the design system: Button, Field, Card, Badge,
  StatusStepper, StatCard, ScoreRing, ConfidenceMeter, DataTable, Tabs,
  Toast, Dropzone, empty/error/loading states.
- `frontend/components/` – app pieces: `AppShell` (sidebar, top bar, search),
  dashboards, charts (`charts/`, Recharts), review and grade views.
- `frontend/app/globals.css` – design tokens (colours, shadows, chart
  palette) for light and dark mode.

---

## 11. Backend code map

```
backend/
├── app/
│   ├── main.py              FastAPI app; creates the Qdrant collections on startup
│   ├── core/config.py       all settings (read from backend/.env)
│   ├── auth/                password hashing, JWT, role dependencies
│   ├── api/
│   │   ├── access.py        course membership / ownership checks
│   │   └── routes/          one file per resource (see section 9)
│   ├── models/              SQLAlchemy tables (section 6)
│   ├── schemas/             Pydantic request/response models
│   ├── services/            business logic: courses, materials, assignments,
│   │                        submissions, grading (runs the agent), review,
│   │                        analytics (all SQL metrics), storage, conversations
│   ├── agents/
│   │   ├── evaluation/      graph.py, nodes.py, scoring.py, prompts.py, state.py
│   │   ├── analytics/       graph.py, nodes.py, tools.py, verify.py, prompts.py
│   │   └── chat/            graph.py, nodes.py, prompts.py, state.py
│   └── rag/                 llm.py (OpenRouter), vector_store.py (Qdrant),
│                            pdf.py (text extraction), chunking.py
├── alembic/versions/        database migrations
├── scripts/                 seed_demo.py, smoke_ai.py, demo data builders
├── demo_data/               DB201 course notes and a sample answer PDF
└── tests/                   pytest suite (LLM and Qdrant are faked)
```

---

## 12. Configuration

All settings live in `backend/.env` (template: `backend/.env.example`).

| Setting | Default | What it controls |
|---|---|---|
| `JWT_SECRET_KEY` | (required) | token signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | session length |
| `OPENROUTER_API_KEY` | (required for AI) | LLM and embeddings |
| `CHAT_MODEL` / `EMBEDDING_MODEL` | free NVIDIA models | which models are used |
| `EMBEDDING_DIMENSIONS` | 2048 | must match the embedding model |
| `LLM_MAX_ATTEMPTS`, `LLM_MAX_PARALLEL` | 3, 3 | retries and concurrent LLM calls |
| `RETRIEVAL_TOP_K`, `RETRIEVAL_MIN_SCORE` | 5, 0.25 | chatbot retrieval and its scope cut-off |
| `GRADING_SIMILARITY_LOW` / `_HIGH` | 0.35 / 0.70 | similarity range mapped to 0–100% expected score |
| `GRADING_MIN_CONFIDENCE` | 0.6 | below this a question is re-checked, then flagged |
| `GRADING_CONCURRENCY`, `GRADING_TIMEOUT_SECONDS` | 2, 900 | background grading limits |
| `LEARNING_GAP_THRESHOLD` | 0.5 | topic mastery below this is a learning gap |
| `BACKEND_API_URL` (frontend) | `http://127.0.0.1:8000` | where Next.js forwards `/api/backend` |

The similarity and retrieval thresholds are calibrated for
`nvidia/nemotron-3-embed-1b`; re-tune them if the embedding model changes.
