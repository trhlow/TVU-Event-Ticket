const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";
const USE_DEMO_DATA = import.meta.env.VITE_USE_DEMO_DATA === "true";
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

// FIXME(frontend): single-flight this refresh. Right now every 401'd request calls it
// independently, so a page that fires several API calls at once after the session expires sends
// several parallel /auth/session/refresh calls with the SAME device cookie. The backend rotates the
// token on first use and treats the second arrival of an already-rotated token as a stolen cookie,
// which revokes EVERY trusted device — logging the admin out and forcing a new OTP. Dedupe concurrent
// callers onto one shared in-flight promise (module-level `let inFlight: Promise<boolean> | null`)
// so the burst becomes a single refresh. Until then the 30-day "remember this device" feature is
// unreliable on any multi-request page. See docs review 2026-07-24.
async function tryRefreshSession(): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl("/auth/session/refresh"), {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retryOnAuthFailure = true): Promise<T> {
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

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError("Không thể kết nối máy chủ. Vui lòng kiểm tra backend và thử lại.", 0);
  }

  if (!response.ok) {
    // A remembered admin browser holds a device cookie but only a 15-minute session. On the first 401,
    // trade the cookie for a fresh session and replay the request once. The refresh endpoint answers 401
    // for anyone without a valid device cookie (every student), so this is a no-op for them.
    if (
      response.status === 401 &&
      retryOnAuthFailure &&
      !path.includes("/auth/session/refresh") &&
      (await tryRefreshSession())
    ) {
      return apiRequest<T>(path, init, false);
    }
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
};

export function apiUrl(path: string): string {
  return buildApiUrl(path);
}

export function createUnsupportedApiError(featureName: string): ApiError {
  return new ApiError(`Backend hiện chưa có API cho chức năng ${featureName}.`, 501);
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

  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) {
    if (lower.includes("locked")) return "Tài khoản hoặc câu lạc bộ đang bị khóa.";
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  if (status === 404) return "Không tìm thấy dữ liệu yêu cầu.";
  if (status === 409) {
    if (lower.includes("already") || lower.includes("duplicate")) return "Yêu cầu bị trùng hoặc đã được xử lý trước đó.";
    if (lower.includes("sold") || lower.includes("capacity") || lower.includes("ticket")) {
      return "Sự kiện đã hết vé hoặc không còn khả dụng.";
    }
    return message || "Yêu cầu xung đột với dữ liệu hiện có.";
  }
  if (status === 400 || status === 422) return message || "Dữ liệu gửi lên chưa hợp lệ.";
  if (status >= 500) return "Máy chủ đang gặp lỗi. Vui lòng thử lại sau.";
  return message || code || "Không thể kết nối máy chủ. Vui lòng thử lại sau.";
}
