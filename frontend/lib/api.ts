export type UserRole = "student" | "professor" | "admin";

export type User = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  role: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  role: UserRole;
};

export type Course = {
  id: string;
  title: string;
  code: string;
  description: string;
  semester: string;
  created_at: string;
  professor_id: string;
  professor_name: string;
  student_count: number;
  material_count: number;
};

export type CourseInput = {
  title: string;
  code: string;
  description: string;
  semester: string;
};

export type Material = {
  id: string;
  course_id: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  page_count: number;
  chunk_count: number;
  error: string | null;
  created_at: string;
  has_file: boolean;
};

export type ChatSource = {
  material_id: string;
  filename: string;
  page: number;
  chunk_index: number;
  score: number;
  text: string;
};

export type ChatStatus = "grounded" | "not_in_material" | "out_of_scope";

export type TraceStep = { node: string; detail: string };

export type ChatResponse = {
  course_id: string;
  conversation_id: string;
  message_id: string;
  created_at: string;
  answer: string;
  status: ChatStatus;
  grounded: boolean;
  in_scope: boolean;
  sources: ChatSource[];
  trace: TraceStep[];
};

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: ChatStatus | null;
  sources: ChatSource[] | null;
  trace: TraceStep[] | null;
  created_at: string;
};

export type Conversation = {
  course_id: string;
  conversation_id: string | null;
  messages: StoredChatMessage[];
};

export type AssignmentSummary = {
  id: string;
  course_id: string;
  title: string;
  deadline: string;
  created_at: string;
  question_count: number;
  total_marks: number;
  /** Professors only. */
  submission_count: number | null;
  /** The requesting student's submission status; null if not submitted. */
  my_status: SubmissionStatus | null;
  /** The student's published total, once faculty publish the grade. */
  my_score: number | null;
};

export type SubmissionStatus =
  | "submitted"
  | "evaluating"
  | "under_review"
  | "published"
  | "failed";

export type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  filename: string;
  page_count: number;
  status: SubmissionStatus;
  submitted_at: string;
  updated_at: string;
};

export type RosterState = SubmissionStatus | "not_submitted" | "overdue";

export type RosterRow = {
  student_id: string;
  student_name: string;
  student_email: string;
  state: RosterState;
  submission: Submission | null;
  error: string | null;
  ai_marks: number | null;
  final_marks: number | null;
};

export type SubmissionRoster = {
  assignment_id: string;
  deadline: string;
  enrolled: number;
  submitted: number;
  pending: number;
  overdue: number;
  total_marks: number;
  students: RosterRow[];
};

/** A question as students see it: never the answer key. */
export type StudentQuestion = {
  id: string;
  position: number;
  text: string;
  max_marks: number;
  topic: string;
};

export type Question = StudentQuestion & {
  model_answer: string;
  key_points: string[];
};

export type StudentAssignment = {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  deadline: string;
  created_at: string;
  questions: StudentQuestion[];
};

/** Full assignment with its answer key (course professor only). */
export type Assignment = Omit<StudentAssignment, "questions"> & {
  updated_at: string;
  answer_keys_indexed: boolean;
  questions: Question[];
};

export type QuestionInput = {
  text: string;
  model_answer: string;
  max_marks: number;
  topic: string;
  key_points: string[];
};

export type AssignmentInput = {
  title: string;
  instructions: string;
  deadline: string; // ISO 8601 with timezone
  questions: QuestionInput[];
};

export type QuestionResult = {
  question_id: string;
  position: number;
  text: string;
  topic: string;
  max_marks: number;
  student_answer: string;
  similarity: number | null;
  ai_marks: number;
  final_marks: number | null;
  key_points_hit: string[];
  key_points_missed: string[];
  incorrect_points: string[];
  rationale: string;
  confidence: number;
  flagged: boolean;
  rechecked: boolean;
  feedback: string;
  feedback_sources: { filename: string; page: number }[];
};

export type SubmissionResults = {
  submission: Submission;
  student_name: string;
  student_email: string;
  error: string | null;
  graded_at: string | null;
  published_at: string | null;
  review_log: ReviewLogEntry[];
  grading_trace: TraceStep[];
  total_ai_marks: number;
  total_marks: number;
  flagged_count: number;
  questions: QuestionResult[];
};

export type ReviewLogEntry = {
  action: "approve" | "override" | "publish";
  question_position: number | null;
  ai_marks: number | null;
  final_marks: number | null;
  faculty_name: string;
  created_at: string;
};

export type ReviewInput = {
  questions: { question_id: string; final_marks: number; feedback: string }[];
  publish: boolean;
};

export type StudentQuestionResult = {
  position: number;
  text: string;
  topic: string;
  max_marks: number;
  marks: number;
  key_points_hit: string[];
  key_points_missed: string[];
  feedback: string;
  feedback_sources: { filename: string; page: number }[];
};

export type StudentResult = {
  submission: Submission;
  published_at: string;
  total_marks: number;
  max_marks: number;
  questions: StudentQuestionResult[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const apiBaseUrl = "/api/backend";

function errorDetail(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("detail" in payload)) {
    return "Request failed";
  }
  const { detail } = payload;
  // FastAPI validation errors are a list of {msg, loc, ...} objects.
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String(item.msg)
          : String(item),
      )
      .join("; ");
  }
  return String(detail);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(errorDetail(payload), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export function register(input: RegisterInput): Promise<User> {
  return request<User>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: input.fullName,
      email: input.email,
      password: input.password,
      role: input.role.toLowerCase(),
    }),
  });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams({ username: email, password });
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export function getCurrentUser(token: string): Promise<User> {
  return request<User>("/users/me", { headers: authHeaders(token) });
}

export function getEnrolledCourses(token: string): Promise<Course[]> {
  return request<Course[]>("/courses/enrolled", { headers: authHeaders(token) });
}

export function getMyCourses(token: string): Promise<Course[]> {
  return request<Course[]>("/courses/my", { headers: authHeaders(token) });
}

export function getAvailableCourses(token: string): Promise<Course[]> {
  return request<Course[]>("/courses", { headers: authHeaders(token) });
}

export function getCourse(token: string, courseId: string): Promise<Course> {
  return request<Course>(`/courses/${courseId}`, { headers: authHeaders(token) });
}

export function createCourse(token: string, input: CourseInput): Promise<Course> {
  return request<Course>("/courses", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function joinCourseByCode(token: string, code: string): Promise<Course> {
  return request<Course>("/courses/join", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

export function enrollInCourse(token: string, courseId: string): Promise<unknown> {
  return request<unknown>(`/courses/${courseId}/enroll`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function listMaterials(token: string, courseId: string): Promise<Material[]> {
  return request<Material[]>(`/courses/${courseId}/materials`, {
    headers: authHeaders(token),
  });
}

export function uploadMaterial(
  token: string,
  courseId: string,
  file: File,
): Promise<Material> {
  const body = new FormData();
  body.append("file", file);
  return request<Material>(`/courses/${courseId}/materials`, {
    method: "POST",
    headers: authHeaders(token),
    body,
  });
}

/** Fetch a PDF from an endpoint that needs the bearer token. */
async function fetchPdf(token: string, path: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: authHeaders(token) });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(errorDetail(payload), response.status);
  }
  return response.blob();
}

/** Download a material's original PDF. */
export function getMaterialPdf(token: string, courseId: string, materialId: string): Promise<Blob> {
  return fetchPdf(token, `/courses/${courseId}/materials/${materialId}/file`);
}

export function getConversation(token: string, courseId: string): Promise<Conversation> {
  return request<Conversation>(`/courses/${courseId}/chat`, { headers: authHeaders(token) });
}

export function sendChatMessage(
  token: string,
  courseId: string,
  question: string,
): Promise<ChatResponse> {
  return request<ChatResponse>(`/courses/${courseId}/chat`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
}

export function listAssignments(token: string, courseId: string): Promise<AssignmentSummary[]> {
  return request<AssignmentSummary[]>(`/courses/${courseId}/assignments`, {
    headers: authHeaders(token),
  });
}

export function getAssignment(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<StudentAssignment> {
  return request<StudentAssignment>(`/courses/${courseId}/assignments/${assignmentId}`, {
    headers: authHeaders(token),
  });
}

/** The assignment with its answer key; only the course professor may call this. */
export function getAssignmentKey(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<Assignment> {
  return request<Assignment>(`/courses/${courseId}/assignments/${assignmentId}/key`, {
    headers: authHeaders(token),
  });
}

export function createAssignment(
  token: string,
  courseId: string,
  input: AssignmentInput,
): Promise<Assignment> {
  return request<Assignment>(`/courses/${courseId}/assignments`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateAssignment(
  token: string,
  courseId: string,
  assignmentId: string,
  input: AssignmentInput,
): Promise<Assignment> {
  return request<Assignment>(`/courses/${courseId}/assignments/${assignmentId}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteAssignment(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<void> {
  return request<void>(`/courses/${courseId}/assignments/${assignmentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function getMySubmission(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<Submission | null> {
  const result = await request<{ submission: Submission | null }>(
    `/courses/${courseId}/assignments/${assignmentId}/submission`,
    { headers: authHeaders(token) },
  );
  return result.submission;
}

export function submitAssignment(
  token: string,
  courseId: string,
  assignmentId: string,
  file: File,
): Promise<Submission> {
  const body = new FormData();
  body.append("file", file);
  return request<Submission>(`/courses/${courseId}/assignments/${assignmentId}/submission`, {
    method: "POST",
    headers: authHeaders(token),
    body,
  });
}

export function getMySubmissionPdf(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<Blob> {
  return fetchPdf(token, `/courses/${courseId}/assignments/${assignmentId}/submission/file`);
}

export function getRoster(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<SubmissionRoster> {
  return request<SubmissionRoster>(`/courses/${courseId}/assignments/${assignmentId}/submissions`, {
    headers: authHeaders(token),
  });
}

export function getSubmissionPdf(
  token: string,
  courseId: string,
  assignmentId: string,
  submissionId: string,
): Promise<Blob> {
  return fetchPdf(
    token,
    `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/file`,
  );
}

/** A submission's AI evaluation (course professor only). */
export function getSubmissionResults(
  token: string,
  courseId: string,
  assignmentId: string,
  submissionId: string,
): Promise<SubmissionResults> {
  return request<SubmissionResults>(
    `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`,
    { headers: authHeaders(token) },
  );
}

/** Retry AI grading of a failed or stuck submission. */
export function regradeSubmission(
  token: string,
  courseId: string,
  assignmentId: string,
  submissionId: string,
): Promise<Submission> {
  return request<Submission>(
    `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
    { method: "POST", headers: authHeaders(token) },
  );
}

/** Approve or override AI marks and feedback; publish to show the student. */
export function reviewSubmission(
  token: string,
  courseId: string,
  assignmentId: string,
  submissionId: string,
  input: ReviewInput,
): Promise<SubmissionResults> {
  return request<SubmissionResults>(
    `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/review`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

/** The student's own published grade (404 until faculty publish it). */
export function getMyResult(
  token: string,
  courseId: string,
  assignmentId: string,
): Promise<StudentResult> {
  return request<StudentResult>(
    `/courses/${courseId}/assignments/${assignmentId}/submission/result`,
    { headers: authHeaders(token) },
  );
}

export type TopicMastery = {
  topic: string;
  mastery: number;
  earned: number;
  possible: number;
  graded_answers: number;
  is_gap: boolean;
};

export type AssignmentCompletion = {
  assignment_id: string;
  title: string;
  deadline: string;
  enrolled: number;
  submitted: number;
  pending: number;
  overdue: number;
  published: number;
  rate: number;
  average_score: number | null;
};

export type CourseAnalytics = {
  course_id: string;
  gap_threshold: number;
  enrolled: number;
  assignments: number;
  comprehension: number | null;
  completion_rate: number | null;
  topics: TopicMastery[];
  completion: AssignmentCompletion[];
  students: {
    student_id: string;
    student_name: string;
    student_email: string;
    comprehension: number | null;
    graded: number;
    submitted: number;
    overdue: number;
  }[];
  overdue: {
    student_id: string;
    student_name: string;
    assignment_id: string;
    assignment_title: string;
    deadline: string;
  }[];
  agreement: {
    reviewed_answers: number;
    exact_agreement: number | null;
    within_half_mark: number | null;
    mean_abs_difference: number | null;
    overrides: number;
    flagged: number;
    flagged_overridden: number;
  };
};

export type StudentProgress = {
  course_id: string;
  student_id: string;
  student_name: string;
  gap_threshold: number;
  comprehension: number | null;
  topics: TopicMastery[];
  trend: {
    assignment_id: string;
    title: string;
    deadline: string;
    earned: number;
    possible: number;
    score: number;
  }[];
  assignments: {
    assignment_id: string;
    title: string;
    deadline: string;
    state: "graded" | "under_review" | "submitted" | "overdue" | "pending" | "failed";
    score: number | null;
  }[];
};

export function getCourseAnalytics(token: string, courseId: string): Promise<CourseAnalytics> {
  return request<CourseAnalytics>(`/courses/${courseId}/analytics`, { headers: authHeaders(token) });
}

export function getMyProgress(token: string, courseId: string): Promise<StudentProgress> {
  return request<StudentProgress>(`/courses/${courseId}/analytics/me`, { headers: authHeaders(token) });
}

export function getStudentProgress(
  token: string,
  courseId: string,
  studentId: string,
): Promise<StudentProgress> {
  return request<StudentProgress>(`/courses/${courseId}/analytics/students/${studentId}`, {
    headers: authHeaders(token),
  });
}

export type AnalyticsInsight = {
  question: string;
  /** null when the agent's numbers could not be verified against the data */
  insight: string | null;
  verified: boolean;
  unsupported_numbers: string[];
  tool_calls: { tool: string; args: Record<string, unknown>; result: unknown; error: string | null }[];
  trace: TraceStep[];
};

/** Ask the analytics agent; every number in the answer is checked against SQL results. */
export function askAnalytics(
  token: string,
  courseId: string,
  input: { question?: string; student_id?: string },
): Promise<AnalyticsInsight> {
  return request<AnalyticsInsight>(`/courses/${courseId}/analytics/insight`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
