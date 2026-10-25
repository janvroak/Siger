# Design decision records

The main decisions behind SIGER, why they were made, and what they cost.
Newest first. See [architecture.md](architecture.md) for how they fit together.

---

## DDR-9 · Seed demo data without calling the LLM

**Decision.** `scripts/seed_demo.py` writes a complete class (professor, six
students, three assignments, graded and published work, a learning gap, an
at-risk student, a missed deadline, two submissions waiting for review)
directly to the database, with deterministic grades.

**Why.** The free model tier allows about 50 requests a day. Grading a whole
demo class through the agent would use most of it before anyone opens the app.

**Trade-off.** Seeded grades show what the agent produces but were not
produced by it. `scripts/smoke_ai.py` covers the live path (about 12 requests).

---

## DDR-8 · Chatbot decides scope from retrieval, not an LLM planner

**Decision.** The chatbot embeds the question, searches the slides, and only
calls the LLM if at least one chunk is above `RETRIEVAL_MIN_SCORE`. Otherwise
it refuses straight away.

**Why.** The first design had a planner LLM that routed each question. It made
no real decision the similarity score couldn't make, cost one request per
question, and refused inconsistently.

**Trade-off.** The threshold depends on the embedding model and must be
re-tuned if the model changes. The answer step can still mark a question
off-topic when words match the slides but the request doesn't.

---

## DDR-7 · Analytics agent may only quote numbers that a SQL tool returned

**Decision.** The LLM picks from nine fixed, parameterised SQL tools and
explains the results. A deterministic `verify_numbers` step checks every
figure in the insight against the tool results; one rewrite is allowed, after
that the insight is withheld.

**Why.** LLMs invent plausible numbers. In an academic dashboard a wrong
figure about a student is worse than no insight.

**Trade-off.** Some correct derived figures (for example a difference the
model computed) are rejected. The dashboards themselves never depend on the
LLM, so they are always available.

---

## DDR-6 · Tools are scoped by role inside the agent

**Decision.** A student's analytics session only sees student tools, and the
student ID argument is forced to their own ID.

**Why.** Prompt-level instructions ("only ask about yourself") can be talked
around; a tool that isn't offered can't be called.

---

## DDR-5 · Human in the loop before any grade is visible

**Decision.** AI grades land in `under_review`. A student sees nothing until
faculty approve or override each question and publish. Both `ai_marks` and
`final_marks` are stored, and every action goes to `review_log`.

**Why.** Grades affect students; the AI assists, faculty decide. Keeping both
marks also gives a direct evaluation metric: how often faculty agreed with
the AI (shown on the class dashboard).

---

## DDR-4 · Confidence = agreement of two independent signals

**Decision.** The LLM's key-point comparison sets the marks. Embedding
similarity between the student answer and the model answer is mapped to an
expected score; confidence is `1 - |expected - marks/max|`. Below 0.6, the
question gets one stricter re-check, then is flagged for faculty.

**Why.** LLM self-reported confidence is poorly calibrated. Similarity alone
can't grade (a wrong answer with the right vocabulary scores high), but a
large gap between the two signals is a good reason to look closer.

**Trade-off.** The similarity range (`GRADING_SIMILARITY_LOW/HIGH`) is
calibrated per embedding model.

---

## DDR-3 · Grade against the teacher's answer key, one question at a time

**Decision.** Faculty write each question with a model answer, marks, a topic
and optional key points. The evaluation agent scores each question in
parallel (LangGraph `Send`) against its own key.

**Why.** A concrete reference answer makes grades consistent and easy to
justify; per-question scoring gives topic-level data for mastery and learning
gaps. The first design graded against a generic rubric.

**Trade-off.** Faculty must write answer keys. Editing is locked once anyone
has submitted so grades always match the key used.

---

## DDR-2 · Answer keys live in their own vector collection

**Decision.** Model answers are embedded into `answer_keys`; lecture slides
into `course_chunks`. The chatbot can only search `course_chunks`.

**Why.** If keys and slides shared a collection, a student could ask the
chatbot for the answers. Separate collections make that impossible by
construction rather than by filtering.

---

## DDR-1 · Use labelled answers before asking the LLM to segment

**Decision.** If a submission's answers are labelled (Q1, Question 2, Ans 3…)
in order, a regex splits them. The LLM maps text to questions only when the
labels are missing, repeated or out of order.

**Why.** Most typed submissions are labelled; this saves one LLM call per
submission and is fully predictable.

---

## Scope cuts

Deliberately not built, so the core path works end to end: project and coding
assessments, OCR for handwritten or scanned answers, plagiarism detection,
live websocket updates (pages poll instead), and notifications.
