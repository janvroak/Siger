"use client";

import { FormEvent, useState } from "react";

import { inputClass, primaryButton, secondaryButton } from "@/components/Modal";
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
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_16rem]">
          <label className="block text-sm font-medium">
            Title
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              placeholder="e.g. Assignment 2 — Normalization"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Deadline
            <input
              className={inputClass}
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              required
            />
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium">
          Instructions for students <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className={`${inputClass} min-h-20`}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={5000}
            placeholder="e.g. Label each answer with its question number (Q1, Q2…) and upload one PDF."
          />
        </label>
      </section>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Questions and answer key</h2>
          <p className="text-sm text-slate-500">
            Students only ever see the question text, marks and topic. The model answer and key
            points are used for AI grading and stay private.
          </p>
        </div>
        <p className="shrink-0 text-sm text-slate-500">
          Total: <span className="font-semibold text-slate-800">{totalMarks}</span> marks
        </p>
      </div>

      {questions.map((question, index) => (
        <section
          key={question.key}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Question {index + 1}</h3>
            <div className="flex gap-1 text-sm">
              <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </IconButton>
              <IconButton
                label="Move down"
                disabled={index === questions.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </IconButton>
              <IconButton
                label="Remove question"
                disabled={questions.length === 1}
                onClick={() =>
                  setQuestions((current) => current.filter((item) => item.key !== question.key))
                }
              >
                ✕
              </IconButton>
            </div>
          </div>

          <label className="mt-4 block text-sm font-medium">
            Question
            <textarea
              className={`${inputClass} min-h-20`}
              value={question.text}
              onChange={(event) => update(question.key, { text: event.target.value })}
              maxLength={5000}
              required
            />
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_8rem]">
            <label className="block text-sm font-medium">
              Topic
              <input
                className={inputClass}
                value={question.topic}
                onChange={(event) => update(question.key, { topic: event.target.value })}
                maxLength={100}
                placeholder="e.g. Normalization"
                list="topic-suggestions"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Max marks
              <input
                className={inputClass}
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                value={question.max_marks}
                onChange={(event) => update(question.key, { max_marks: event.target.value })}
                required
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium">
            Model answer <PrivateBadge />
            <textarea
              className={`${inputClass} min-h-28 bg-amber-50/40`}
              value={question.model_answer}
              onChange={(event) => update(question.key, { model_answer: event.target.value })}
              maxLength={10000}
              placeholder="The answer you would give full marks to."
              required
            />
          </label>

          <div className="mt-4">
            <p className="text-sm font-medium">
              Key points <PrivateBadge />{" "}
              <span className="font-normal text-slate-400">
                (optional, up to {MAX_KEY_POINTS} — what a full-marks answer must contain)
              </span>
            </p>
            <div className="mt-1 space-y-2">
              {question.key_points.map((point, pointIndex) => (
                <div key={pointIndex} className="flex gap-2">
                  <input
                    className={`${inputClass} mt-0 bg-amber-50/40`}
                    value={point}
                    maxLength={500}
                    onChange={(event) =>
                      update(question.key, {
                        key_points: question.key_points.map((item, i) =>
                          i === pointIndex ? event.target.value : item,
                        ),
                      })
                    }
                    placeholder={`Key point ${pointIndex + 1}`}
                  />
                  <IconButton
                    label="Remove key point"
                    onClick={() =>
                      update(question.key, {
                        key_points: question.key_points.filter((_, i) => i !== pointIndex),
                      })
                    }
                  >
                    ✕
                  </IconButton>
                </div>
              ))}
            </div>
            {question.key_points.length < MAX_KEY_POINTS ? (
              <button
                type="button"
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                onClick={() => update(question.key, { key_points: [...question.key_points, ""] })}
              >
                + Add key point
              </button>
            ) : null}
          </div>
        </section>
      ))}

      <datalist id="topic-suggestions">
        {[...new Set(questions.map((question) => question.topic.trim()).filter(Boolean))].map(
          (topic) => (
            <option key={topic} value={topic} />
          ),
        )}
      </datalist>

      <button
        type="button"
        className={`${secondaryButton} w-full border-dashed py-3`}
        onClick={() =>
          setQuestions((current) => [...current, emptyQuestion(current.at(-1)?.topic ?? "")])
        }
        disabled={questions.length >= 30}
      >
        + Add question
      </button>

      <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur">
        {error ? <p className="mr-auto text-sm text-red-700">{error}</p> : null}
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function PrivateBadge() {
  return (
    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Hidden from students
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="h-8 w-8 shrink-0 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
