const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const USE_DEMO_DATA = import.meta.env.VITE_USE_DEMO_DATA !== "false";
const ENABLE_MOCK_FALLBACK = USE_DEMO_DATA || import.meta.env.VITE_ENABLE_MOCK_FALLBACK === "true";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
  useDemoData: USE_DEMO_DATA,
  enableMockFallback: ENABLE_MOCK_FALLBACK,
};

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.clone().json();
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.error === "string") return data.error;
  } catch {
    // Fall through to text/default handling.
  }

  try {
    const text = await response.text();
    if (text.trim()) return text;
  } catch {
    // Fall through to default handling.
  }

  return "Không thể kết nối máy chủ. Vui lòng thử lại sau.";
}
