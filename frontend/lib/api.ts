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
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
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

export type ChatResponse = {
  course_id: string;
  answer: string;
  status: ChatStatus;
  grounded: boolean;
  in_scope: boolean;
  sources: ChatSource[];
  trace: { node: string; detail: string }[];
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

export function sendChatMessage(
  token: string,
  courseId: string,
  question: string,
  history: ChatTurn[],
): Promise<ChatResponse> {
  return request<ChatResponse>(`/courses/${courseId}/chat`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
}
