# Failure modes and known limitations

What can go wrong, what the system does about it, and what it doesn't handle
yet. Useful when something looks broken in a demo.

## How failures are handled

| What fails | What happens | Where |
|---|---|---|
| **LLM daily quota reached** (free tier ≈ 50 requests/day) | The request fails with a message saying when the quota resets. A grading run is marked `failed` with that reason; faculty press **Retry grading** later. | `rag/llm.py` (`LLMRateLimitError`), `services/grading.py` |
| LLM timeout, provider error or empty reply | Retried up to `LLM_MAX_ATTEMPTS` (3) times before failing. | `rag/llm.py` |
| LLM returns marks out of range or not a number | Marks are clamped to `[0, max_marks]` and rounded to half marks. | `agents/evaluation/scoring.py` |
| AI grade and similarity disagree | One stricter re-check; if they still disagree the question is **flagged** for faculty. | `agents/evaluation/nodes.py` |
| Feedback LLM call fails | Grading still completes; feedback is built from the key points missed. | `write_feedback` |
| Grading crashes or exceeds `GRADING_TIMEOUT_SECONDS` (900) | Submission status becomes `failed` with the reason; nothing is half-saved; retry from the submission page. | `services/grading.py` |
| Backend restarts while a submission is being graded | On startup, every submission left in `evaluating` is marked `failed` ("interrupted by a server restart") so faculty can retry it. | `main.py` lifespan, `grading.recover_interrupted` |
| Embedding service down when an assignment is saved | The assignment is saved with `answer_keys_indexed = false`; the key is indexed when grading starts. | `services/assignments.py` |
| Answer key still not indexed at grading time | Grading fails with "the answer key of question N is not indexed". | `segment_answers` |
| Analytics agent quotes a number not in the data | One rewrite is requested; if still wrong the insight is **withheld** and the UI says so. The dashboards are unaffected. | `agents/analytics/verify.py` |
| Chatbot question not covered by the slides | Refused without an LLM call (`out_of_scope`) or after one (`not_in_material`). | `agents/chat/nodes.py` |
| Lecture PDF upload fails half-way | Material is marked `failed` with the reason; any chunks already written to Qdrant are removed. | `services/materials.py` |
| Same lecture PDF uploaded twice | Detected by SHA-256 and rejected as a duplicate. | `services/materials.py` |
| Uploaded file isn't a readable PDF | Rejected on upload: not a PDF, encrypted, unreadable, or no text layer. | `rag/pdf.py` |
| Submission after the deadline, or a second submission | Rejected; one submission per student per assignment. | `services/submissions.py` |
| Answer key edited after students submitted | Blocked (409), so grades always match the key they were graded against. | `api/routes/assignments.py` |
| Embedding model changed | The API still starts; Qdrant calls report the vector-size mismatch. Delete both collections and re-index. | `rag/vector_store.py` |
| Qdrant down at startup | The API still starts with a warning; uploads, chat and grading report "Qdrant is unavailable". | `main.py` |

## Known limitations

- **Scanned or handwritten PDFs are not supported.** Only PDFs with a text
  layer can be graded or indexed (OCR was out of scope).
- **Grading runs inside the API process.** Background tasks are not a job
  queue: a restart interrupts them (they are then marked failed and can be
  retried), and they don't spread across several servers.
- **One shared AI quota.** On the free tier every user shares about 50
  requests a day. A grading run costs one request per question plus one for
  feedback (plus one if answers aren't labelled Q1, Q2…).
- **Files on local disk.** Uploaded PDFs live in `backend/uploads/`, so the
  backend needs persistent storage when deployed.
- **No live updates.** Pages poll while grading is running (every 5–15 s)
  instead of using websockets.
- **Tokens in `localStorage`.** Simple and adequate for a project; a
  production deployment should prefer httpOnly cookies.
- **Admin role exists but has no features.** The `admin` role is in the
  database model; the UI shows a placeholder.
