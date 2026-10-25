"use client";

import {
  ArrowUp,
  BookMarked,
  BookOpen,
  ChevronDown,
  CircleSlash,
  FileSearch,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";

import {
  ApiError,
  getConversation,
  getEnrolledCourses,
  listMaterials,
  sendChatMessage,
  type ChatResponse,
  type ChatStatus,
  type Course,
  type Material,
  type StoredChatMessage,
} from "@/lib/api";
import { AppShell, Logo } from "@/components/AppShell";
import { Badge, type Tone } from "@/components/ui/Badge";
import { cn } from "@/components/ui/Button";
import { Callout, Skeleton } from "@/components/ui/States";
import { useAuthedUser } from "@/lib/useAuthedUser";

type Reply = Pick<ChatResponse, "answer" | "status" | "sources" | "trace">;

type MessageBody =
  | { role: "user"; content: string }
  | { role: "assistant"; reply: Reply }
  | { role: "error"; content: string };

type Message = MessageBody & { id: string; createdAt?: string };

const STATUS_BADGE: Record<ChatStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  grounded: { label: "Grounded in course material", tone: "success", icon: ShieldCheck },
  not_in_material: { label: "Not in course material", tone: "warning", icon: FileSearch },
  out_of_scope: { label: "Outside this course", tone: "neutral", icon: CircleSlash },
};

const NODE_LABELS: Record<string, string> = {
  retrieve: "Retrieve",
  check_relevance: "Relevance check",
  answer: "Answer",
  refuse: "Refuse",
  // Steps of the earlier flow, still shown in saved conversations.
  planner: "Planner",
  retrieval: "Retrieval",
  teaching: "Teaching",
  refusal: "Refusal",
};

function fromStored(message: StoredChatMessage): Message {
  if (message.role === "user") {
    return { id: message.id, role: "user", content: message.content, createdAt: message.created_at };
  }
  return {
    id: message.id,
    role: "assistant",
    createdAt: message.created_at,
    reply: {
      answer: message.content,
      status: message.status ?? "grounded",
      sources: message.sources ?? [],
      trace: message.trace ?? [],
    },
  };
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? `${fallback} ${error.message} (HTTP ${error.status})` : fallback;
}

export default function CourseChatPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { token, user, error: authError } = useAuthedUser("student");

  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pageError, setPageError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [earlierCount, setEarlierCount] = useState(0);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const nextLocalId = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    async function loadCourse(activeToken: string) {
      let selected: Course | undefined;
      try {
        const enrolled = await getEnrolledCourses(activeToken);
        selected = enrolled.find((item) => item.id === courseId);
      } catch (caughtError) {
        setPageError(describeError(caughtError, "Unable to load your courses."));
        return;
      }
      if (!selected) {
        setPageError("You are not enrolled in this course.");
        return;
      }
      setCourse(selected);

      // Material and saved history load independently, so one failing never
      // hides the other or blocks asking new questions.
      const [materialsResult, conversationResult] = await Promise.allSettled([
        listMaterials(activeToken, selected.id),
        getConversation(activeToken, selected.id),
      ]);
      if (materialsResult.status === "fulfilled") {
        setMaterials(materialsResult.value);
        setMaterialsLoaded(true);
      } else {
        setPageError(
          describeError(materialsResult.reason, "Unable to load the course material."),
        );
      }
      if (conversationResult.status === "fulfilled") {
        setMessages(conversationResult.value.messages.map(fromStored));
        setEarlierCount(conversationResult.value.messages.length);
      } else {
        setHistoryError(
          describeError(
            conversationResult.reason,
            "Your previous conversation could not be loaded.",
          ),
        );
      }
      setHistoryLoaded(true);
    }
    void loadCourse(token);
  }, [token, courseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSending]);

  const readyMaterials = materials.filter((material) => material.status === "ready");

  function localId() {
    return `local-${nextLocalId.current++}`;
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !token || !course || isSending) {
      return;
    }
    const pendingId = localId();
    setMessages((current) => [
      ...current.filter((message) => message.role !== "error"),
      { id: pendingId, role: "user", content: trimmed },
    ]);
    setQuestion("");
    setIsSending(true);

    try {
      const response = await sendChatMessage(token, course.id, trimmed);
      setMessages((current) => [
        ...current,
        { id: response.message_id, role: "assistant", reply: response, createdAt: response.created_at },
      ]);
    } catch (caughtError) {
      // The server saves nothing when a question fails, so drop it here too and
      // give the text back for a retry.
      setMessages((current) => [
        ...current.filter((message) => message.id !== pendingId),
        {
          id: localId(),
          role: "error",
          content:
            caughtError instanceof ApiError
              ? caughtError.message
              : "Something went wrong. Please try again.",
        },
      ]);
      setQuestion(trimmed);
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
    <AppShell user={user} token={token} fullHeight title={course ? `${course.code} assistant` : "Teaching assistant"}>
      <div className="flex h-full flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                <MessageSquareText size={17} aria-hidden />
              </span>
              <div className="min-w-0">
                {course ? (
                  <h1 className="truncate text-[15px] font-semibold text-fg">{course.title}</h1>
                ) : (
                  <Skeleton className="h-4 w-48" />
                )}
                <Link
                  className="text-xs text-muted transition-colors hover:text-fg"
                  href={`/courses/${courseId}`}
                >
                  {course ? `${course.code} · ${course.semester}` : "Course page"}
                </Link>
              </div>
            </div>
            {course && materialsLoaded ? (
              <details className="group relative shrink-0">
                <summary className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg">
                  <BookOpen size={13} aria-hidden />
                  {readyMaterials.length === 0
                    ? "No material yet"
                    : `${readyMaterials.length} document${readyMaterials.length === 1 ? "" : "s"}`}
                  {readyMaterials.length ? <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden /> : null}
                </summary>
                {readyMaterials.length ? (
                  <ul className="absolute right-0 z-20 mt-2 w-64 animate-pop-in rounded-lg border border-line bg-surface p-1.5 shadow-lg">
                    {readyMaterials.map((material) => (
                      <li key={material.id} className="truncate rounded-md px-2.5 py-1.5 text-xs text-fg">
                        {material.filename}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6" aria-live="polite">
            {error ? <Callout tone="danger">{error}</Callout> : null}
            {!error && (!course || !historyLoaded) ? (
              <div className="space-y-4" role="status" aria-label="Loading your conversation">
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-28 w-5/6 rounded-2xl" />
              </div>
            ) : null}

            {historyError ? (
              <Callout tone="warning">{historyError} You can still ask new questions.</Callout>
            ) : null}

            {earlierCount > 0 ? (
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                Previous conversation · started {new Date(messages[0]?.createdAt ?? Date.now()).toLocaleDateString()}
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : null}

            {course && historyLoaded && messages.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                  <Sparkles size={22} aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-fg">Ask anything about {course.code}</h2>
                <p className="mt-1.5 max-w-md text-sm text-muted">
                  Siger answers only from your course material and shows the pages it used. Questions outside this
                  course will be politely declined.
                </p>
                {materialsLoaded && readyMaterials.length === 0 ? (
                  <Callout tone="warning" className="mt-5 text-left">
                    Your professor has not uploaded course material yet, so questions cannot be answered.
                  </Callout>
                ) : null}
              </div>
            ) : null}

            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex animate-fade-in justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-accent-fg shadow-sm">
                    {message.content}
                  </p>
                </div>
              ) : message.role === "error" ? (
                <div key={message.id} className="flex animate-fade-in justify-start">
                  <Callout tone="danger" className="max-w-[85%]">
                    {message.content}
                  </Callout>
                </div>
              ) : (
                <AssistantMessage key={message.id} response={message.reply} />
              ),
            )}

            {isSending ? (
              <div className="flex animate-fade-in items-start gap-3">
                <AssistantAvatar />
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3.5 shadow-sm" role="status">
                  <span className="sr-only">The assistant is answering…</span>
                  <span className="flex gap-1" aria-hidden>
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="border-t border-line bg-surface/90 backdrop-blur-md">
          <form className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6" onSubmit={handleSubmit}>
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
              <label className="sr-only" htmlFor="question">
                Your question
              </label>
              <textarea
                id="question"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-fg outline-none placeholder:text-subtle disabled:cursor-not-allowed"
                rows={1}
                placeholder={course ? `Ask about ${course.code}…` : "Loading…"}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
                disabled={!course || isSending}
              />
              <button
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-[background-color,transform,opacity] duration-150 hover:bg-accent-hover active:scale-95 disabled:opacity-40"
                type="submit"
                aria-label={isSending ? "Sending" : "Send"}
                disabled={!course || isSending || !question.trim()}
              >
                <ArrowUp size={17} aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-subtle">
              Enter to send · Shift+Enter for a new line · answers cite your course material
            </p>
          </form>
        </footer>
      </div>
    </AppShell>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 shrink-0" aria-hidden>
      <Logo size={28} />
    </span>
  );
}

function AssistantMessage({ response }: { response: Reply }) {
  const badge = STATUS_BADGE[response.status];
  const [openSource, setOpenSource] = useState<number | null>(null);
  const declined = response.status !== "grounded";

  return (
    <div className="flex animate-fade-in items-start gap-3">
      <AssistantAvatar />
      <div className="min-w-0 max-w-[90%] flex-1 sm:flex-none">
        <div
          className={cn(
            "rounded-2xl rounded-tl-md border px-4 py-3 shadow-sm",
            declined ? "border-dashed border-line-strong bg-surface-2/60" : "border-line bg-surface",
          )}
        >
          <Badge tone={badge.tone} icon={badge.icon} size="sm">
            {badge.label}
          </Badge>
          <div className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-fg">{renderAnswer(response.answer)}</div>

          {response.sources.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs font-medium text-muted">Sources</p>
              <ul className="flex flex-wrap gap-1.5">
                {response.sources.map((source, index) => (
                  <li key={`${source.material_id}-${source.chunk_index}`}>
                    <button
                      type="button"
                      aria-expanded={openSource === index}
                      onClick={() => setOpenSource(openSource === index ? null : index)}
                      className={cn(
                        "inline-flex max-w-64 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                        openSource === index
                          ? "border-accent-line bg-accent-soft text-fg"
                          : "border-line bg-surface-2 text-muted hover:text-fg",
                      )}
                    >
                      <span className="font-semibold text-accent-text">{index + 1}</span>
                      <BookMarked size={12} className="shrink-0" aria-hidden />
                      <span className="truncate">{source.filename}</span>
                      <span className="shrink-0 font-medium text-fg">p. {source.page}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {openSource !== null && response.sources[openSource] ? (
                <blockquote className="mt-2 animate-fade-in rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-2.5 text-sm">
                  <p className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted">
                    <span>
                      {response.sources[openSource].filename} · page {response.sources[openSource].page}
                    </span>
                    <span>relevance {Math.round(response.sources[openSource].score * 100)}%</span>
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap text-fg">{response.sources[openSource].text}</p>
                </blockquote>
              ) : null}
            </div>
          ) : null}
        </div>

        {response.trace.length > 0 ? (
          <details className="group mt-1.5 ml-1 text-xs text-muted">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded transition-colors hover:text-fg">
              <Workflow size={12} aria-hidden />
              {response.trace.map((step) => NODE_LABELS[step.node] ?? step.node).join(" → ")}
            </summary>
            <ul className="mt-2 space-y-1 rounded-lg border border-line bg-surface p-3">
              {response.trace.map((step, index) => (
                <li key={index}>
                  <span className="font-medium text-fg">{NODE_LABELS[step.node] ?? step.node}:</span> {step.detail}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

/** Render **bold** spans and [n] citation markers; everything else stays text. */
function renderAnswer(answer: string): ReactNode[] {
  return answer.split(/(\*\*[^*]+\*\*|\[\d+(?:,\s*\d+)*\])/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (/^\[\d+(?:,\s*\d+)*\]$/.test(part)) {
      return (
        <sup key={index} className="ml-0.5 rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent-text">
          {part.slice(1, -1)}
        </sup>
      );
    }
    return part;
  });
}
