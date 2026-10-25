# Learning the codebase

A reading path for someone new to SIGER. Each step builds on the previous
one, in the same order the system was built. Allow about two hours to go
through it; run the app with demo data first (see the [README](../README.md))
so you can click along.

## 0. The big picture (10 min)

Read [architecture.md](architecture.md) sections 1 and 2. You should be able
to answer: which three parts use an LLM, and what happens between a student
uploading a PDF and seeing a grade?

## 1. Accounts and roles (10 min)

- `backend/app/models/user.py` – the `users` table and the three roles.
- `backend/app/auth/security.py`, `dependencies.py` – password hashing, JWT,
  and the `get_current_professor` / `get_current_student` guards every route uses.
- `backend/app/api/access.py` – "is this user allowed in this course?"
- `frontend/lib/useAuthedUser.ts` – how pages find the signed-in user.

## 2. Courses, material and the answer key (20 min)

- `backend/app/models/course.py`, `assignment.py` – courses, enrolments,
  assignments and questions (with `model_answer` and `key_points`).
- `backend/app/services/materials.py` → `backend/app/rag/` – a lecture PDF
  becomes text (`pdf.py`), chunks (`chunking.py`), embeddings (`llm.py`) and
  Qdrant points (`vector_store.py`).
- `backend/app/services/assignments.py` – saving an assignment also embeds
  its model answers into the separate `answer_keys` collection. Why separate?
  See [DDR-2](DDR.md#ddr-2--answer-keys-live-in-their-own-vector-collection).

## 3. Submitting and grading (40 min) – the core

1. `backend/app/api/routes/submissions.py` → `services/submissions.py`:
   the upload is saved and a background task starts.
2. `backend/app/services/grading.py`: loads everything the agent needs,
   runs it with a timeout, stores the results.
3. `backend/app/agents/evaluation/graph.py`: the graph in 30 lines. Then read
   `nodes.py` top to bottom, one node at a time, alongside the diagram in
   [architecture.md §3](architecture.md#3-evaluation-agent).
4. `backend/app/agents/evaluation/scoring.py`: the deterministic maths
   (label splitting, similarity → confidence). Small and worth reading fully.
5. `backend/app/agents/evaluation/prompts.py`: what the LLM is actually asked.

Try it: `uv run pytest tests/test_evaluation_graph.py -v` runs the graph with
a fake LLM, so you can see each path (agree, re-check, flag) without quota.

## 4. Faculty review (15 min)

- `backend/app/services/review.py` – approve / override / publish and the
  review log.
- `frontend/app/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]/page.tsx`
  – the review screen that calls it.

## 5. Analytics (25 min)

- `backend/app/services/analytics.py` – every dashboard number as one SQL
  function; the definitions are in its docstring.
- `backend/app/agents/analytics/tools.py` – the nine tools the agent may call
  and which role may call each.
- `backend/app/agents/analytics/verify.py` – how every number in an insight
  is checked. Then `graph.py` and `nodes.py`.

## 6. Lecture chatbot (15 min)

- `backend/app/agents/chat/graph.py` and `nodes.py` – retrieve, decide scope
  without an LLM, answer with citations or refuse.

## 7. Frontend (20 min)

- `frontend/lib/api.ts` – the only file that calls the backend; all response
  types are defined here.
- `frontend/components/AppShell.tsx` – sidebar, top bar, search, theme.
- `frontend/components/ui/` – the shared design system. Use these instead of
  writing new button or card styles.
- `frontend/app/globals.css` – colour tokens for light and dark mode.

## Where to make common changes

| I want to… | Start here |
|---|---|
| change how answers are graded | `agents/evaluation/prompts.py`, `scoring.py` |
| tune when a question is flagged | `GRADING_MIN_CONFIDENCE`, `GRADING_SIMILARITY_*` in `backend/.env` |
| add a dashboard number | a function in `services/analytics.py` + `schemas/analytics.py` |
| let the analytics agent use it | a `Tool` in `agents/analytics/tools.py` |
| change the chatbot's refusal threshold | `RETRIEVAL_MIN_SCORE` |
| add a database column | the model in `app/models/`, then `uv run alembic revision --autogenerate -m "…"` |
| add an endpoint | a route in `app/api/routes/`, logic in `app/services/`, a test in `tests/` |
| add a page | `frontend/app/…/page.tsx`, an API function in `frontend/lib/api.ts` |

## Tests

`backend/tests/` has 93 tests that run against a real PostgreSQL with the LLM
and Qdrant faked (`conftest.py`, `api_world.py`). Run them with
`cd backend && uv run pytest`. The frontend is checked with
`npm run lint` and `npm run build`.
