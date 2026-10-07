"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";

import {
  ApiError,
  getEnrolledCourses,
  listMaterials,
  sendChatMessage,
  type ChatResponse,
  type ChatStatus,
  type ChatTurn,
  type Course,
  type Material,
} from "@/lib/api";
import { useAuthedUser } from "@/lib/useAuthedUser";

type MessageBody =
  | { role: "user"; content: string }
  | { role: "assistant"; response: ChatResponse }
  | { role: "error"; content: string };

type Message = MessageBody & { id: number };

const HISTORY_LIMIT = 10;

const STATUS_BADGE: Record<ChatStatus, { label: string; className: string }> = {
  grounded: {
    label: "Grounded in course material",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  not_in_material: {
    label: "Not in course material",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  out_of_scope: {
    label: "Out of scope",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

const NODE_LABELS: Record<string, string> = {
  planner: "Planner",
  retrieval: "Retrieval",
  teaching: "Teaching",
  refusal: "Refusal",
};

export default function CourseChatPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { token, user, error: authError } = useAuthedUser("student");

  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pageError, setPageError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const nextId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadCourse(activeToken: string) {
      try {
        const enrolled = await getEnrolledCourses(activeToken);
        const selected = enrolled.find((item) => item.id === courseId);
        if (!selected) {
          setPageError("You are not enrolled in this course.");
          return;
        }
        setCourse(selected);
        setMaterials(await listMaterials(activeToken, selected.id));
      } catch {
        setPageError("Unable to load this course.");
      }
    }
    void loadCourse(token);
  }, [token, courseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSending]);

  const readyMaterials = materials.filter((material) => material.status === "ready");

  function addMessage(message: MessageBody) {
    const withId = { ...message, id: nextId.current++ };
    setMessages((current) => [...current, withId]);
  }

  function historyFor(current: Message[]): ChatTurn[] {
    const turns: ChatTurn[] = [];
    for (const message of current) {
      if (message.role === "user") {
        turns.push({ role: "user", content: message.content });
      } else if (message.role === "assistant") {
        turns.push({ role: "assistant", content: message.response.answer });
      }
    }
    return turns.slice(-HISTORY_LIMIT);
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !token || !course || isSending) {
      return;
    }
    const history = historyFor(messages);
    addMessage({ role: "user", content: trimmed });
    setQuestion("");
    setIsSending(true);

    try {
      const response = await sendChatMessage(token, course.id, trimmed, history);
      addMessage({ role: "assistant", response });
    } catch (caughtError) {
      addMessage({
        role: "error",
        content:
          caughtError instanceof ApiError
            ? caughtError.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(question);
    }
  }

  const error = authError || pageError;

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <Link className="text-sm text-slate-500 hover:text-slate-800" href="/dashboard">
              ← Dashboard
            </Link>
            {course ? (
              <>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {course.code} · {course.semester}
                </p>
                <h1 className="text-lg font-semibold">{course.title}</h1>
              </>
            ) : (
              <h1 className="mt-2 text-lg font-semibold">Course assistant</h1>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-slate-500">
            {user ? <p>Signed in as {user.full_name}</p> : null}
            {course ? (
              <p className="mt-1">
                {readyMaterials.length === 0
                  ? "No course material yet"
                  : `${readyMaterials.length} document${readyMaterials.length === 1 ? "" : "s"}: ${readyMaterials
                      .map((material) => material.filename)
                      .join(", ")}`}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
          {error ? (
            <p className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {!error && !course ? <p className="text-sm text-slate-600">Loading course...</p> : null}

          {course && messages.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Ask a question about {course.code}</p>
              <p className="mt-1">
                SIGER answers only from your course material and shows the pages it used.
                Questions outside this course will be politely declined.
              </p>
              {readyMaterials.length === 0 ? (
                <p className="mt-3 text-amber-800">
                  Your professor has not uploaded course material yet, so questions cannot be
                  answered.
                </p>
              ) : null}
            </div>
          ) : null}

          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-white">
                  {message.content}
                </p>
              </div>
            ) : message.role === "error" ? (
              <div key={message.id} className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                  {message.content}
                </p>
              </div>
            ) : (
              <AssistantMessage key={message.id} response={message.response} />
            ),
          )}

          {isSending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                <span className="animate-pulse">Planner → Retrieval → Teaching…</span>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <form className="mx-auto flex w-full max-w-3xl gap-3 px-4 py-4" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="question">
            Your question
          </label>
          <textarea
            id="question"
            className="min-h-11 flex-1 resize-none rounded border border-slate-300 px-3 py-2.5 disabled:bg-slate-50"
            rows={1}
            placeholder={course ? `Ask about ${course.code}…` : "Loading…"}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            disabled={!course || isSending}
          />
          <button
            className="rounded bg-slate-900 px-5 py-2.5 text-white disabled:opacity-50"
            type="submit"
            disabled={!course || isSending || !question.trim()}
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </form>
      </footer>
    </div>
  );
}

function AssistantMessage({ response }: { response: ChatResponse }) {
  const badge = STATUS_BADGE[response.status];

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3">
        <span
          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
        <div className="whitespace-pre-wrap leading-relaxed">{renderAnswer(response.answer)}</div>

        {response.sources.length > 0 ? (
          <details className="rounded border border-slate-200 bg-slate-50" open>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
              Sources ({response.sources.length})
            </summary>
            <ol className="space-y-2 px-3 pb-3">
              {response.sources.map((source, index) => (
                <li
                  key={`${source.material_id}-${source.chunk_index}`}
                  className="rounded border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      [{index + 1}] {source.filename} · page {source.page}
                    </span>
                    <span className="text-xs text-slate-500">
                      relevance {Math.round(source.score * 100)}%
                    </span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      Show excerpt
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-slate-600">{source.text}</p>
                  </details>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">
            Path: {response.trace.map((step) => NODE_LABELS[step.node] ?? step.node).join(" → ")}
          </summary>
          <ul className="mt-2 space-y-1">
            {response.trace.map((step, index) => (
              <li key={index}>
                <span className="font-medium text-slate-700">
                  {NODE_LABELS[step.node] ?? step.node}:
                </span>{" "}
                {step.detail}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

/** Render **bold** spans and [n] citation markers; everything else stays text. */
function renderAnswer(answer: string): ReactNode[] {
  return answer.split(/(\*\*[^*]+\*\*|\[\d+(?:,\s*\d+)*\])/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (/^\[\d+(?:,\s*\d+)*\]$/.test(part)) {
      return (
        <sup key={index} className="ml-0.5 font-medium text-emerald-700">
          {part}
        </sup>
      );
    }
    return part;
  });
}
