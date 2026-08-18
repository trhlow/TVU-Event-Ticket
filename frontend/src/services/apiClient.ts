import { isAuthenticated, setCurrentUser } from "../state/authSession";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";
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

// Dedupe concurrent callers onto one shared in-flight promise so a page that fires several API
// calls at once after the session expires sends a single /auth/session/refresh instead of several
// parallel ones with the same device cookie (the backend revokes every trusted device if it sees
// an already-rotated token arrive twice).
let refreshInFlight: Promise<boolean> | null = null;

function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(buildApiUrl("/auth/session/refresh"), {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
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
    throw new ApiError("Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.", 0);
  }

  if (!response.ok) {
    // A remembered admin browser holds a device cookie but only a 15-minute session. On the first 401,
    // trade the cookie for a fresh session and replay the request once. The refresh endpoint answers 401
    // for anyone without a valid device cookie (every student), so this is a no-op for them.
    if (response.status === 401) {
      if (
        retryOnAuthFailure &&
        !path.includes("/auth/session/refresh") &&
        (await tryRefreshSession())
      ) {
        return apiRequest<T>(path, init, false);
      }
      // The session genuinely died (refresh failed or this already was the refresh call). If the
      // app thought it was logged in, drop the stale cache and send the user back to /login instead
      // of leaving them staring at a "protected" page that just quietly 401s on every action.
      handleSessionExpired();
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

function handleSessionExpired(): void {
  if (!isAuthenticated()) return;
  setCurrentUser(null);
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
};

export function apiUrl(path: string): string {
  return buildApiUrl(path);
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
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));

  try {
    const data = await response.clone().json();
    const message = localizeError(response.status, data?.message || data?.error, retryAfterSeconds);
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
    if (text.trim()) return new ApiError(localizeError(response.status, text, retryAfterSeconds), response.status);
  } catch {
    // Fall through to default handling.
  }

  return new ApiError(localizeError(response.status, undefined, retryAfterSeconds), response.status);
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
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

// Backend error messages are always plain English (ResponseStatusException reason strings, or raw
// JPA/DB constraint text for unhandled exceptions) — never meant for direct end-user display. This
// maps known messages to Vietnamese and otherwise falls back to a generic Vietnamese message per
// status code, so an unmapped backend string (e.g. a raw DataIntegrityViolationException reason)
// never leaks to the screen verbatim.
function localizeError(status: number, rawMessage?: string, retryAfterSeconds?: number): string {
  const message = typeof rawMessage === "string" ? rawMessage : "";
  const lower = message.toLowerCase();

  if (status === 401) {
    if (lower.includes("invalid email or code") || lower.includes("invalid dev credential")) {
      return "Email hoặc mã đăng nhập không đúng.";
    }
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  if (status === 403) {
    if (lower.includes("locked")) return "Tài khoản hoặc câu lạc bộ đang bị khóa.";
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  if (status === 404) return "Không tìm thấy dữ liệu yêu cầu.";
  if (status === 409) {
    if (lower.includes("already exists") || lower.includes("duplicate")) return "Dữ liệu đã tồn tại, không thể tạo trùng.";
    // Must come before the "sold out" branch below: TicketingService throws "Ticket cannot be
    // checked in" for an already-used or otherwise invalid ticket, which contains neither "sold"
    // nor "capacity" but does contain "ticket" -- a bare `includes("ticket")` check previously
    // caught it and told the organizer at the door the event was sold out, when the real issue was
    // a reused or invalid QR code.
    if (lower.includes("expired")) return "Mã QR đã hết hạn.";
    if (lower.includes("cannot be checked in")) return "Vé không hợp lệ hoặc đã được check-in trước đó.";
    // Also before the sold-out branch, and for exactly the same reason as the note above.
    // EventService throws "Capacity cannot be changed after an event is opened"; that contains
    // "capacity", so an organizer editing their own open event was told the event had no tickets
    // left. Untrue, and it sends them looking at ticket numbers instead of at the rule they hit.
    if (lower.includes("capacity cannot be changed")) {
      return "Không thể đổi sức chứa sau khi sự kiện đã mở đăng ký.";
    }
    if (lower.includes("sold out") || lower.includes("capacity")) {
      return "Sự kiện đã hết vé hoặc không còn khả dụng.";
    }
    // Verifying a student's MSSV. Both of these used to fall through to the generic "reload the
    // page and try again", which is advice that cannot work: reloading changes nothing about a
    // student who has not filled in their MSSV, and nothing about an account that is not a
    // student's. The admin was left retrying an action that could never succeed.
    if (lower.includes("no mssv to verify")) {
      return "Sinh viên chưa nhập MSSV nên chưa thể xác minh.";
    }
    if (lower.includes("only a student account has an mssv")) {
      return "Chỉ tài khoản sinh viên mới có MSSV để xác minh.";
    }
    if (lower.includes("inactive") || lower.includes("locked")) return "Câu lạc bộ hoặc tài khoản liên quan đang bị khóa.";
    if (lower.includes("must be completed")) return "Vui lòng hoàn tất hồ sơ (MSSV) trước khi tiếp tục.";
    return "Yêu cầu xung đột với dữ liệu hiện có. Vui lòng tải lại trang và thử lại.";
  }
  if (status === 400 || status === 422) {
    if (lower.includes("not an organizer")) return "Tài khoản này không phải Ban tổ chức CLB.";
    // Field-level validation messages are surfaced separately via fieldErrors; this is the
    // catch-all summary, so prefer a stable Vietnamese message over an unmapped English one.
    return "Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại các trường thông tin.";
  }
  if (status === 429) {
    return retryAfterSeconds
      ? `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfterSeconds} giây.`
      : "Bạn thao tác quá nhanh. Vui lòng chờ một lát rồi thử lại.";
  }
  if (status >= 500) return "Máy chủ đang gặp lỗi. Vui lòng thử lại sau.";
  return "Không thể kết nối máy chủ. Vui lòng thử lại sau.";
}
