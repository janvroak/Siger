# SIGER

Agentic AI academic assessment and learning-analytics platform. Faculty create
assignments with an answer key; an evaluation agent grades student PDFs against
it with explainable, per-question feedback; faculty approve or override before
anything is published; dashboards and an analytics agent show topic mastery,
learning gaps and progress. A lecture chatbot answers questions from the course
slides.

Built with Next.js, FastAPI, LangGraph, PostgreSQL, Qdrant and OpenRouter.

## AI components (LangGraph)

| Agent | Flow |
|---|---|
| Evaluation agent | extract text → map answers to questions → score each question in parallel (LLM vs model answer, embedding similarity as a check) → re-check once on disagreement, then flag → feedback from lecture slides → save for faculty review |
| Analytics agent | the LLM picks fixed SQL tools (role-scoped) → explains the results → every number is verified against the query results |
| Lecture chatbot | retrieve from the slides → relevance check (no LLM call when off-topic) → grounded answer with citations, or a polite refusal |

## Run it locally

```bash
docker compose up -d                       # PostgreSQL + Qdrant
cd backend
cp .env.example .env                       # then set JWT_SECRET_KEY and OPENROUTER_API_KEY
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload       # API on http://localhost:8000

cd ../frontend
npm install
npm run dev                                # app on http://localhost:3000
```

## Demo data

```bash
cd backend
uv run python -m scripts.seed_demo         # --remove deletes it all again
```

Creates a professor, six students and DB201 with three assignments, graded and
published work, a learning gap, an at-risk student, a missed deadline and two
submissions waiting for review. The grades are generated without any LLM calls.
All demo accounts use the password `SigerDemo123`:

- `prof.demo@siger.edu` – faculty (class analytics, review queue)
- `student.demo@siger.edu` – Sam, the demo student; Assignment 3 is still open.
  Submit `backend/demo_data/sam_assignment3_answers.pdf` to watch the
  evaluation agent grade it live.

Only embedding the course notes uses the AI provider; if that step is skipped
(quota), run the seed again later.

## Live AI check

With the API running and the demo data seeded:

```bash
cd backend
uv run python -m scripts.smoke_ai
```

Submits Sam's answers, waits for the AI grade, publishes it, asks the analytics
agent and the chatbot one question each (about 12 provider requests).

## Free-tier notes

The default models are OpenRouter's free models
(`nvidia/nemotron-3-ultra-550b-a55b:free` for chat,
`nvidia/nemotron-3-embed-1b:free` for embeddings), which share a daily request
limit (about 50 requests). To stay within it:

- grading uses one LLM call per question plus one for feedback; clearly
  labelled answers (Q1, Q2…) need no extra call to map them to questions;
- the chatbot refuses off-topic questions without an LLM call;
- AI insights are generated only when asked for, never on page load.

When the limit is reached the app says so and when it resets; failed gradings
can be retried from the submission page.

## Tests

```bash
cd backend
uv run pytest        # needs PostgreSQL running; the LLM and Qdrant are faked
```
