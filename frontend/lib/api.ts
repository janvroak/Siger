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

/** Download a material's original PDF (the endpoint needs the bearer token). */
export async function getMaterialPdf(
  token: string,
  courseId: string,
  materialId: string,
): Promise<Blob> {
  const response = await fetch(
    `${apiBaseUrl}/courses/${courseId}/materials/${materialId}/file`,
    { headers: authHeaders(token) },
  );
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(errorDetail(payload), response.status);
  }
  return response.blob();
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
