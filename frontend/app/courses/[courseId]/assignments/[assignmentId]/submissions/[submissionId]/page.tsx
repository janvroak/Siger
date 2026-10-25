"use client";

import {
  CheckCircle2,
  Flag,
  History,
  ListOrdered,
  Pencil,
  RotateCcw,
  ScrollText,
  Send,
  Workflow,
  FileText,
  Save,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell, PageMessage } from "@/components/AppShell";
import { plural } from "@/components/CourseCard";
import { OpenPdfButton, PdfViewer } from "@/components/OpenPdfButton";
import { QuestionResultCard, SourceChips } from "@/components/QuestionResultCard";
import { StatusBadge } from "@/components/SubmissionStatus";
import { Badge } from "@/components/ui/Badge";
import { Button, cn } from "@/components/ui/Button";
import { Page, PageHeader } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Field";
import { ProgressBar, ScoreRing } from "@/components/ui/Metrics";
import { Callout } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import {
  ApiError,
  getSubmissionPdf,
  getSubmissionResults,
  regradeSubmission,
  reviewSubmission,
  type QuestionResult,
  type ReviewLogEntry,
  type SubmissionResults,
  type TraceStep,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

const POLL_MS = 5_000;

type Draft = { marks: string; feedback: string };

function draftsFrom(results: SubmissionResults): Record<string, Draft> {
  return Object.fromEntries(
    results.questions.map((question) => [
      question.question_id,
      {
        marks: String(question.final_marks ?? question.ai_marks),
        feedback: question.feedback,
      },
    ]),
  );
}

export default function SubmissionResultsPage() {
  const { courseId, assignmentId, submissionId } = useParams<{
    courseId: string;
    assignmentId: string;
    submissionId: string;
  }>();
  const { token, user, error: authError } = useAuthedUser();
  const [results, setResults] = useState<SubmissionResults | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pageError, setPageError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [readerTab, setReaderTab] = useState<"answers" | "pdf" | "audit">("answers");

  const show = useCallback((loaded: SubmissionResults) => {
    setResults(loaded);
    setDrafts(draftsFrom(loaded));
  }, []);

  const load = useCallback(
    (activeToken: string) =>
      getSubmissionResults(activeToken, courseId, assignmentId, submissionId)
        .then(show)
        .catch((caught: unknown) =>
          setPageError(
            caught instanceof ApiError && caught.status === 403
              ? "Only the course professor can see AI evaluations."
              : caught instanceof ApiError && caught.status === 404
                ? "This submission does not exist."
                : "Unable to load the submission.",
          ),
        ),
    [courseId, assignmentId, submissionId, show],
  );

  useEffect(() => {
    if (token) {
      void load(token);
    }
  }, [token, load]);

  const status = results?.submission.status;
  const grading = status === "submitted" || status === "evaluating";
  useEffect(() => {
    if (!token || !grading) {
      return;
    }
    const timer = setInterval(() => void load(token), POLL_MS);
    return () => clearInterval(timer);
  }, [token, grading, load]);

  async function retry() {
    if (!token) {
      return;
    }
    setRetrying(true);
    try {
      await regradeSubmission(token, courseId, assignmentId, submissionId);
      await load(token);
    } finally {
      setRetrying(false);
    }
  }

  function focusQuestion(id: string) {
    setActiveId(id);
    setReaderTab("answers");
    document.getElementById(`question-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const error = authError || pageError;
  const assignmentUrl = `/courses/${courseId}/assignments/${assignmentId}`;
  const reviewable = status === "under_review" || status === "published";
  const loadPdf = () => getSubmissionPdf(token!, courseId, assignmentId, submissionId);

  return (
    <AppShell user={user} token={token} title="Review submission">
      {error ? <PageMessage tone="error">{error}</PageMessage> : null}
      {!results && !error ? <PageMessage>Loading submission…</PageMessage> : null}

      {results && token ? (
        <Page width="wide" className="pb-0 lg:pb-0">
          <PageHeader
            back={{ href: assignmentUrl, label: "Back to assignment" }}
            eyebrow={
              <>
                <StatusBadge audience="faculty" state={results.submission.status} />
                {results.flagged_count > 0 ? (
                  <Badge tone="warning" icon={Flag}>
                    {plural(results.flagged_count, "flag")}
                  </Badge>
                ) : null}
              </>
            }
            title={results.student_name}
            description={
              <>
                {results.student_email} · submitted{" "}
                {new Date(results.submission.submitted_at).toLocaleString()}
                {results.published_at ? (
                  <span className="mt-1 flex items-center gap-1.5 text-success">
                    <CheckCircle2 size={14} aria-hidden />
                    Published {new Date(results.published_at).toLocaleString()}, visible to the student
                  </span>
                ) : null}
              </>
            }
            actions={
              <>
                {results.questions.length > 0 ? (
                  <div className="mr-2 flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm">
                    <ScoreRing value={results.total_ai_marks} max={results.total_marks} size={48} />
                    <div className="text-xs">
                      <p className="font-semibold text-fg">AI total</p>
                      <p className="text-muted">{plural(results.questions.length, "question")}</p>
                    </div>
                  </div>
                ) : null}
                <OpenPdfButton label="Open PDF" load={loadPdf} />
              </>
            }
          />

          <div className="space-y-3">
            {grading ? (
              <Callout tone="accent" title="The evaluation agent is grading this submission">
                This page updates automatically.
                <ProgressBar label="Grading in progress" className="mt-2.5 max-w-sm" />
              </Callout>
            ) : null}
            {status === "failed" ? (
              <Callout
                tone="danger"
                title="Grading failed"
                action={
                  <Button variant="primary" size="sm" icon={RotateCcw} loading={retrying} onClick={() => void retry()}>
                    {retrying ? "Starting…" : "Retry grading"}
                  </Button>
                }
              >
                {results.error ?? "unknown error"}
              </Callout>
            ) : null}
          </div>

          {results.questions.length > 0 ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* Reader: the student's work, beside the decisions. */}
              <aside className="h-[60vh] lg:sticky lg:top-6 lg:h-[calc(100vh-3.5rem-3rem-5.5rem)] lg:self-start">
                <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                    <Tabs
                      label="Submission views"
                      value={readerTab}
                      onChange={setReaderTab}
                      tabs={[
                        { id: "answers", label: "Answers", icon: ScrollText },
                        { id: "pdf", label: "PDF", icon: FileText },
                        { id: "audit", label: "Audit", icon: History },
                      ]}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {readerTab === "answers" ? (
                      <AnswerReader questions={results.questions} activeId={activeId} onSelect={focusQuestion} />
                    ) : readerTab === "pdf" ? (
                      <div className="h-full min-h-[28rem]">
                        <PdfViewer load={loadPdf} title={`${results.student_name}'s submission`} />
                      </div>
                    ) : (
                      <AuditTrail trace={results.grading_trace} log={results.review_log} />
                    )}
                  </div>
                </div>
              </aside>

              <div className="min-w-0">
                <QuestionNav
                  questions={results.questions}
                  drafts={drafts}
                  activeId={activeId}
                  onSelect={focusQuestion}
                />
                <ol className="mt-4 space-y-4">
                  {results.questions.map((question) => (
                    <QuestionResultCard
                      key={question.question_id}
                      result={question}
                      feedbackEditable={reviewable}
                      active={activeId === question.question_id}
                      onActivate={() => setActiveId(question.question_id)}
                      showAnswer="mobile"
                    >
                      {reviewable ? (
                        <ReviewControls
                          question={question}
                          draft={drafts[question.question_id]}
                          onChange={(change) =>
                            setDrafts((current) => ({
                              ...current,
                              [question.question_id]: { ...current[question.question_id], ...change },
                            }))
                          }
                        />
                      ) : null}
                    </QuestionResultCard>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}

          {reviewable ? (
            <ReviewBar
              results={results}
              drafts={drafts}
              onSubmit={async (publish) => {
                show(
                  await reviewSubmission(token, courseId, assignmentId, submissionId, {
                    publish,
                    questions: results.questions.map((question) => ({
                      question_id: question.question_id,
                      final_marks: Number(drafts[question.question_id].marks),
                      feedback: drafts[question.question_id].feedback.trim(),
                    })),
                  }),
                );
              }}
            />
          ) : (
            <div className="h-8" />
          )}
        </Page>
      ) : null}
    </AppShell>
  );
}

/** Chips for jumping between questions; flagged and overridden ones are marked. */
function QuestionNav({
  questions,
  drafts,
  activeId,
  onSelect,
}: {
  questions: QuestionResult[];
  drafts: Record<string, Draft>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Questions" className="flex flex-wrap items-center gap-1.5">
      <ListOrdered size={15} className="mr-1 text-subtle" aria-hidden />
      {questions.map((question) => {
        const draft = drafts[question.question_id];
        const overridden = draft && draft.marks !== "" && Number(draft.marks) !== question.ai_marks;
        const active = activeId === question.question_id;
        return (
          <button
            key={question.question_id}
            type="button"
            onClick={() => onSelect(question.question_id)}
            aria-current={active ? "true" : undefined}
            title={
              question.flagged
                ? `Q${question.position}: flagged`
                : overridden
                  ? `Q${question.position}: overridden`
                  : `Q${question.position}`
            }
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors duration-150",
              active
                ? "border-accent bg-accent text-accent-fg"
                : question.flagged
                  ? "border-warning-line bg-warning-soft text-fg hover:border-warning"
                  : "border-line bg-surface text-fg hover:border-line-strong",
            )}
          >
            {question.flagged ? <Flag size={11} fill="currentColor" className={active ? "" : "text-warning"} aria-hidden /> : null}
            Q{question.position}
            {overridden ? <Pencil size={11} className="opacity-70" aria-label="overridden" /> : null}
          </button>
        );
      })}
    </nav>
  );
}

/** The extracted answers, one block per question, synced with the panels on the right. */
function AnswerReader({
  questions,
  activeId,
  onSelect,
}: {
  questions: QuestionResult[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (activeId) {
      refs.current[activeId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeId]);

  return (
    <div className="space-y-2">
      <p className="px-1 pb-1 text-xs text-muted">Text extracted from the submitted PDF, mapped to each question.</p>
      {questions.map((question) => {
        const active = activeId === question.question_id;
        return (
          <article
            key={question.question_id}
            ref={(el) => {
              refs.current[question.question_id] = el;
            }}
            className={cn(
              "rounded-lg border-l-2 px-3.5 py-3 transition-colors duration-200",
              active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(question.question_id)}
              className="flex w-full items-center gap-2 text-left text-xs font-semibold text-muted hover:text-fg"
            >
              <span className={cn("font-display text-[13px]", active ? "text-accent-text" : "text-fg")}>
                Q{question.position}
              </span>
              <span className="truncate font-normal">{question.topic}</span>
              {question.flagged ? <Flag size={11} fill="currentColor" className="ml-auto shrink-0 text-warning" aria-label="flagged" /> : null}
            </button>
            <p className="mt-1.5 font-[Georgia,ui-serif,serif] text-[15px] leading-7 whitespace-pre-wrap text-fg">
              {question.student_answer || <span className="font-sans text-sm text-muted italic">No answer found</span>}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function AuditTrail({ trace, log }: { trace: TraceStep[]; log: ReviewLogEntry[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Workflow size={15} className="text-muted" aria-hidden />
          How this was graded
        </h3>
        {trace.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No grading steps recorded.</p>
        ) : (
          <ol className="mt-3 space-y-0">
            {trace.map((step, index) => (
              <li key={index} className="relative flex gap-3 pb-3 pl-5 last:pb-0">
                <span className="absolute top-1.5 left-0 h-2 w-2 rounded-full bg-accent" aria-hidden />
                {index < trace.length - 1 ? (
                  <span className="absolute top-3.5 bottom-0 left-[3px] w-px bg-line" aria-hidden />
                ) : null}
                <div className="min-w-0 text-sm">
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent-text">
                    {step.node}
                  </code>
                  <p className="mt-1 text-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <History size={15} className="text-muted" aria-hidden />
          Review history
        </h3>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing reviewed yet.</p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {log.map((entry, index) => (
              <li key={index} className="text-sm">
                <p className="text-fg">
                  <span className="font-medium">{entry.faculty_name}</span>{" "}
                  {entry.action === "publish"
                    ? "published the grade"
                    : `${entry.action === "approve" ? "approved" : "overrode"} Q${entry.question_position}: AI ${entry.ai_marks} → ${entry.final_marks}`}
                </p>
                <p className="text-xs text-muted">{new Date(entry.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ReviewControls({
  question,
  draft,
  onChange,
}: {
  question: QuestionResult;
  draft: Draft | undefined;
  onChange: (change: Partial<Draft>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  if (!draft) {
    return null;
  }
  const marks = Number(draft.marks);
  const overridden = draft.marks !== "" && marks !== question.ai_marks;
  const outOfRange = draft.marks !== "" && (Number.isNaN(marks) || marks < 0 || marks > question.max_marks);
  const id = `marks-${question.question_id}`;
  return (
    <div className={cn("mt-4 rounded-lg border p-4", overridden ? "border-warning-line bg-warning-soft/40" : "border-line bg-surface-2/60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted">Your decision</p>
        {overridden ? (
          <Badge tone="warning" icon={Pencil}>
            Override · AI gave {question.ai_marks}
          </Badge>
        ) : (
          <Badge tone="success" icon={CheckCircle2}>
            Approving AI marks
          </Badge>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-fg">
            Final marks
          </label>
          <div className="flex items-center gap-2">
            <input
              id={id}
              ref={input}
              className={cn(inputClass, "w-24 text-center text-base font-semibold tabular-nums")}
              type="number"
              min={0}
              max={question.max_marks}
              step={0.5}
              value={draft.marks}
              aria-invalid={outOfRange || undefined}
              onChange={(event) => onChange({ marks: event.target.value })}
            />
            <span className="text-sm whitespace-nowrap text-muted tabular-nums">/ {question.max_marks}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={overridden ? "secondary" : "primary"}
            icon={CheckCircle2}
            onClick={() => onChange({ marks: String(question.ai_marks) })}
            aria-pressed={!overridden}
          >
            {overridden ? "Use AI marks" : "Approved"}
          </Button>
          <Button
            size="sm"
            variant={overridden ? "primary" : "secondary"}
            icon={Pencil}
            onClick={() => {
              input.current?.focus();
              input.current?.select();
            }}
            aria-pressed={overridden}
          >
            Override
          </Button>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg">Feedback the student will see</span>
        <textarea
          className={cn(inputClass, "min-h-24 leading-relaxed")}
          value={draft.feedback}
          maxLength={5000}
          aria-invalid={!draft.feedback.trim() || undefined}
          onChange={(event) => onChange({ feedback: event.target.value })}
        />
      </label>
      {question.feedback_sources.length > 0 ? (
        <div className="mt-1">
          <p className="mt-2 text-xs text-muted">Lecture material the feedback points to</p>
          <SourceChips sources={question.feedback_sources} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">No slides cited.</p>
      )}
    </div>
  );
}

function ReviewBar({
  results,
  drafts,
  onSubmit,
}: {
  results: SubmissionResults;
  drafts: Record<string, Draft>;
  onSubmit: (publish: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const published = results.submission.status === "published";

  const values = results.questions.map((question) => ({
    question,
    draft: drafts[question.question_id],
  }));
  const invalid = values.find(
    ({ question, draft }) =>
      !draft ||
      draft.marks.trim() === "" ||
      Number.isNaN(Number(draft.marks)) ||
      Number(draft.marks) < 0 ||
      Number(draft.marks) > question.max_marks ||
      !draft.feedback.trim(),
  );
  const total = values.reduce((sum, { draft }) => sum + (Number(draft?.marks) || 0), 0);
  const overrides = values.filter(
    ({ question, draft }) => draft && Number(draft.marks) !== question.ai_marks,
  ).length;

  async function submit(publish: boolean) {
    setBusy(publish ? "publish" : "draft");
    setMessage(null);
    try {
      await onSubmit(publish);
      const text = publish
        ? published
          ? "Published grade updated."
          : "Grade published. The student can now see it."
        : "Draft saved. The student cannot see it yet.";
      setMessage({ tone: "ok", text });
      toast.success(text);
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Could not save the review.";
      setMessage({ tone: "error", text });
      toast.error("Review not saved", text);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <ScoreRing value={total} max={results.total_marks} size={44} label={`Final grade ${total} of ${results.total_marks}`} />
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-x-2 font-medium text-fg">
              Final grade
              {overrides > 0 ? (
                <Badge tone="warning" icon={Pencil} size="sm">
                  {plural(overrides, "override")}
                </Badge>
              ) : (
                <Badge tone="success" icon={CheckCircle2} size="sm">
                  Matches AI
                </Badge>
              )}
            </p>
            {invalid ? (
              <p className="text-xs text-danger" role="alert">
                Q{invalid.question.position}: enter marks between 0 and {invalid.question.max_marks} and some feedback.
              </p>
            ) : message ? (
              <p className={cn("text-xs", message.tone === "ok" ? "text-success" : "text-danger")}>{message.text}</p>
            ) : (
              <p className="text-xs text-muted">
                {published ? "Changes update the grade the student sees." : "The student sees nothing until you publish."}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!published ? (
            <Button
              icon={Save}
              disabled={!!invalid || busy !== null}
              loading={busy === "draft"}
              onClick={() => void submit(false)}
            >
              {busy === "draft" ? "Saving…" : "Save draft"}
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon={Send}
            disabled={!!invalid || busy !== null}
            loading={busy === "publish"}
            onClick={() => void submit(true)}
          >
            {busy === "publish" ? "Publishing…" : published ? "Update published grade" : "Approve & publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
