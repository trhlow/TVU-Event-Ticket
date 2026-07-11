const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";
const USE_DEMO_DATA = import.meta.env.VITE_USE_DEMO_DATA === "true";
const ENABLE_MOCK_FALLBACK = USE_DEMO_DATA || import.meta.env.VITE_ENABLE_MOCK_FALLBACK === "true";
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "X-XSRF-TOKEN";

export class ApiError extends Error {
  status: number;
  code?: string;
  path?: string;
  fieldErrors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    options: { code?: string; path?: string; fieldErrors?: Array<{ field: string; message: string }> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code;
    this.path = options.path;
    this.fieldErrors = options.fieldErrors;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const method = (init.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has(CSRF_HEADER_NAME)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return (await response.text()) as T;
  }

  return unwrapApiResponse(await response.json()) as T;
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
  useDemoData: USE_DEMO_DATA,
  enableMockFallback: ENABLE_MOCK_FALLBACK,
};

export function createUnsupportedApiError(featureName: string): ApiError {
  return new ApiError(`Backend hien chua co API cho chuc nang ${featureName}.`, 501);
}

export function getListPayload<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.content)) return record.content as T[];
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
}

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createApiError(response: Response): Promise<ApiError> {
  try {
    const data = await response.clone().json();
    const message = localizeError(response.status, data?.code, data?.message || data?.error);
    return new ApiError(message, response.status, {
      code: typeof data?.code === "string" ? data.code : undefined,
      path: typeof data?.path === "string" ? data.path : undefined,
      fieldErrors: Array.isArray(data?.fieldErrors) ? data.fieldErrors : undefined,
    });
  } catch {
    // Fall through to text/default handling.
  }

  try {
    const text = await response.text();
    if (text.trim()) return new ApiError(localizeError(response.status, undefined, text), response.status);
  } catch {
    // Fall through to default handling.
  }

  return new ApiError(localizeError(response.status), response.status);
}

function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedBase = API_BASE_URL.replace(/\/$/, "");
  const normalizedPath = (path.startsWith("/") ? path : `/${path}`).replace(/^\/api(?=\/|$)/, "");
  return `${normalizedBase}${normalizedPath}`;
}

function unwrapApiResponse(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: unknown }).data;
  }
  return value;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const item = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${encodeURIComponent(name)}=`));
  if (!item) return null;
  return decodeURIComponent(item.slice(name.length + 1));
}

function localizeError(status: number, code?: string, rawMessage?: string): string {
  const message = typeof rawMessage === "string" ? rawMessage : "";
  const lower = message.toLowerCase();

  if (status === 401) return "Phien dang nhap da het han. Vui long dang nhap lai.";
  if (status === 403) {
    if (lower.includes("locked")) return "Tai khoan hoac cau lac bo dang bi khoa.";
    return "Ban khong co quyen thuc hien thao tac nay.";
  }
  if (status === 404) return "Khong tim thay du lieu yeu cau.";
  if (status === 409) {
    if (lower.includes("already") || lower.includes("duplicate")) return "Yeu cau bi trung hoac da duoc xu ly truoc do.";
    if (lower.includes("sold") || lower.includes("capacity") || lower.includes("ticket")) {
      return "Su kien da het ve hoac khong con kha dung.";
    }
    return message || "Yeu cau xung dot voi du lieu hien co.";
  }
  if (status === 400 || status === 422) return message || "Du lieu gui len chua hop le.";
  if (status >= 500) return "May chu dang gap loi. Vui long thu lai sau.";
  return message || code || "Khong the ket noi may chu. Vui long thu lai sau.";
}
