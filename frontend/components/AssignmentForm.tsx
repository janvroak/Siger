"use client";

import { ArrowDown, ArrowUp, CalendarClock, EyeOff, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useState } from "react";

import { Button, IconButton, cn } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, inputClass } from "@/components/ui/Field";
import { Callout } from "@/components/ui/States";
import { ApiError, type Assignment, type AssignmentInput } from "@/lib/api";

const MAX_KEY_POINTS = 5;

type DraftQuestion = {
  key: number; // stable React key while questions are added and removed
  text: string;
  model_answer: string;
  max_marks: string;
  topic: string;
  key_points: string[];
};

let nextKey = 0;

function emptyQuestion(topic = ""): DraftQuestion {
  return { key: nextKey++, text: "", model_answer: "", max_marks: "5", topic, key_points: [] };
}

/** "2026-10-30T17:00" in the browser's time zone, as datetime-local inputs expect. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultDeadline(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setHours(23, 59, 0, 0);
  return toLocalInput(date.toISOString());
}

type AssignmentFormProps = {
  initial?: Assignment;
  submitLabel: string;
  onSubmit: (input: AssignmentInput) => Promise<void>;
  onCancel: () => void;
};

export function AssignmentForm({ initial, submitLabel, onSubmit, onCancel }: AssignmentFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [deadline, setDeadline] = useState(
    initial ? toLocalInput(initial.deadline) : defaultDeadline(),
  );
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initial
      ? initial.questions.map((question) => ({
          key: nextKey++,
          text: question.text,
          model_answer: question.model_answer,
          max_marks: String(question.max_marks),
          topic: question.topic,
          key_points: question.key_points,
        }))
      : [emptyQuestion()],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totalMarks = questions.reduce((sum, question) => sum + (Number(question.max_marks) || 0), 0);

  function update(key: number, change: Partial<DraftQuestion>) {
    setQuestions((current) =>
      current.map((question) => (question.key === key ? { ...question, ...change } : question)),
    );
  }

  function move(index: number, delta: number) {
    setQuestions((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime())) {
      setError("Please choose a valid deadline.");
      return;
    }
    const badMarks = questions.findIndex((question) => !(Number(question.max_marks) > 0));
    if (badMarks !== -1) {
      setError(`Question ${badMarks + 1}: marks must be greater than 0.`);
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        instructions: instructions.trim(),
        deadline: deadlineDate.toISOString(),
        questions: questions.map((question) => ({
          text: question.text.trim(),
          model_answer: question.model_answer.trim(),
          max_marks: Number(question.max_marks),
          topic: question.topic.trim(),
          key_points: question.key_points.map((point) => point.trim()).filter(Boolean),
        })),
      });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Could not save the assignment.");
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card>
        <CardHeader title="Details" description="What students see at the top of the assignment." />
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_16rem]">
          <Field label="Title">
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              placeholder="e.g. Assignment 2: Normalization"
              required
            />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-muted" aria-hidden />Deadline</span>}>
            <input
              className={inputClass}
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field className="mt-4" label={<>Instructions for students <span className="font-normal text-muted">(optional)</span></>}>
          <textarea
            className={`${inputClass} min-h-20`}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={5000}
            placeholder="e.g. Label each answer with its question number (Q1, Q2…) and upload one PDF."
          />
        </Field>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h2 className="text-base font-semibold text-fg">Questions and answer key</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Students only ever see the question text, marks and topic. The model answer and key points are used for AI
            grading and stay private.
          </p>
        </div>
        <p className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted">
          {questions.length} {questions.length === 1 ? "question" : "questions"} ·{" "}
          <span className="font-semibold text-fg tabular-nums">{totalMarks}</span> marks
        </p>
      </div>

      <ol className="space-y-4">
        {questions.map((question, index) => (
          <li key={question.key} className="animate-fade-in rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-accent-soft px-1.5 font-display text-xs font-bold text-accent-text">
                  Q{index + 1}
                </span>
                {question.topic.trim() ? <span className="truncate font-normal text-muted">{question.topic}</span> : null}
              </h3>
              <div className="flex gap-0.5">
                <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton
                  icon={ArrowDown}
                  size="sm"
                  label="Move down"
                  disabled={index === questions.length - 1}
                  onClick={() => move(index, 1)}
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  variant="danger-ghost"
                  label="Remove question"
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((current) => current.filter((item) => item.key !== question.key))}
                />
              </div>
            </div>

            <div className="space-y-4 p-5">
              <Field label="Question">
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={question.text}
                  onChange={(event) => update(question.key, { text: event.target.value })}
                  maxLength={5000}
                  required
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-[1fr_9rem]">
                <Field label="Topic" hint="Used for topic mastery and learning gaps.">
                  <input
                    className={inputClass}
                    value={question.topic}
                    onChange={(event) => update(question.key, { topic: event.target.value })}
                    maxLength={100}
                    placeholder="e.g. Normalization"
                    list="topic-suggestions"
                    required
                  />
                </Field>
                <Field label="Max marks">
                  <input
                    className={`${inputClass} tabular-nums`}
                    type="number"
                    min="0.5"
                    max="100"
                    step="0.5"
                    value={question.max_marks}
                    onChange={(event) => update(question.key, { max_marks: event.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="rounded-lg border border-warning-line bg-warning-soft/40 p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <EyeOff size={13} aria-hidden />
                  Answer key · hidden from students
                </p>
                <Field label="Model answer">
                  <textarea
                    className={`${inputClass} min-h-28`}
                    value={question.model_answer}
                    onChange={(event) => update(question.key, { model_answer: event.target.value })}
                    maxLength={10000}
                    placeholder="The answer you would give full marks to."
                    required
                  />
                </Field>
                <KeyPoints
                  points={question.key_points}
                  onChange={(key_points) => update(question.key, { key_points })}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <datalist id="topic-suggestions">
        {[...new Set(questions.map((question) => question.topic.trim()).filter(Boolean))].map((topic) => (
          <option key={topic} value={topic} />
        ))}
      </datalist>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong py-4 text-sm font-medium text-muted transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-accent-text disabled:opacity-50"
        onClick={() => setQuestions((current) => [...current, emptyQuestion(current.at(-1)?.topic ?? "")])}
        disabled={questions.length >= 30}
      >
        <Plus size={16} aria-hidden />
        Add question
      </button>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm text-muted">
            <span className="font-semibold text-fg tabular-nums">{questions.length}</span> {questions.length === 1 ? "question" : "questions"} ·{" "}
            <span className="font-semibold text-fg tabular-nums">{totalMarks}</span> marks
          </p>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving}>
            {saving ? "Saving…" : submitLabel}
          </Button>
        </div>
        {error ? <Callout tone="danger" className="mt-3">{error}</Callout> : null}
      </div>
    </form>
  );
}

/** Key points as removable chips, added one at a time with Enter. */
function KeyPoints({ points, onChange }: { points: string[]; onChange: (points: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const full = points.length >= MAX_KEY_POINTS;

  function add() {
    const text = draft.trim();
    if (!text || full) return;
    onChange([...points, text]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    } else if (event.key === "Backspace" && !draft && points.length) {
      onChange(points.slice(0, -1));
    }
  }

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-sm font-medium text-fg">
        Key points{" "}
        <span className="font-normal text-muted">
          (optional, up to {MAX_KEY_POINTS}: what a full-marks answer must contain)
        </span>
      </p>
      <div
        className={cn(
          inputClass,
          "flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20",
        )}
      >
        {points.map((point, index) => (
          <span
            key={`${index}:${point}`}
            className="inline-flex max-w-full animate-pop-in items-center gap-1 rounded-md border border-line bg-surface-2 py-0.5 pr-0.5 pl-2 text-[13px] text-fg"
          >
            <span className="min-w-0 break-words">{point}</span>
            <button
              type="button"
              aria-label={`Remove key point: ${point}`}
              className="rounded p-0.5 text-subtle transition-colors hover:bg-surface-3 hover:text-fg"
              onClick={() => onChange(points.filter((_, i) => i !== index))}
            >
              <X size={13} aria-hidden />
            </button>
          </span>
        ))}
        {!full ? (
          <input
            className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm text-fg outline-none placeholder:text-subtle"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={add}
            placeholder={points.length ? "Add another…" : "Type a key point and press Enter"}
            aria-label="Add a key point"
          />
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-muted tabular-nums">
        {points.length} / {MAX_KEY_POINTS}
        {full ? " · limit reached" : " · Enter to add, Backspace to remove the last one"}
      </p>
    </div>
  );
}
