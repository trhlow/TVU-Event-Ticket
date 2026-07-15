export type AuthProvider = "microsoft" | "devstub";
export type AppEnvironment = "development" | "production";

export interface EnvValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_PROVIDERS: AuthProvider[] = ["microsoft", "devstub"];
const VALID_APP_ENVS: AppEnvironment[] = ["development", "production"];

const rawAuthProvider = (import.meta.env.VITE_AUTH_PROVIDER || "microsoft").trim().toLowerCase();
const rawAppEnv = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim().toLowerCase();

export const authProvider = rawAuthProvider;
export const isMicrosoftProvider = rawAuthProvider === "microsoft";
export const isDevStubProvider = rawAuthProvider === "devstub";

// Falls back to Vite's own production flag when VITE_APP_ENV isn't set explicitly, so a plain
// `vite build` is still treated as production even if the operator forgot to set the variable.
export const appEnv: AppEnvironment =
  rawAppEnv === "production" || rawAppEnv === "development" ? rawAppEnv : import.meta.env.PROD ? "production" : "development";
export const isProductionEnv = appEnv === "production";

export const useDemoData = import.meta.env.VITE_USE_DEMO_DATA === "true";
export const legacyMockFallbackConfigured = import.meta.env.VITE_ENABLE_MOCK_FALLBACK === "true";
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";

export function validateAppEnv(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!VALID_PROVIDERS.includes(rawAuthProvider as AuthProvider)) {
    errors.push(`VITE_AUTH_PROVIDER="${rawAuthProvider}" không hợp lệ. Chỉ chấp nhận: ${VALID_PROVIDERS.join(", ")}.`);
  }

  if (rawAppEnv && !VALID_APP_ENVS.includes(rawAppEnv as AppEnvironment)) {
    errors.push(`VITE_APP_ENV="${rawAppEnv}" không hợp lệ. Chỉ chấp nhận: ${VALID_APP_ENVS.join(", ")}.`);
  }

  if (isProductionEnv && isDevStubProvider) {
    errors.push(
      "VITE_AUTH_PROVIDER=devstub không được phép khi chạy production (VITE_APP_ENV=production hoặc build production). " +
        "DevStub là cơ chế đăng nhập không mật khẩu chỉ dành cho môi trường phát triển cục bộ.",
    );
  }

  if (isProductionEnv && useDemoData) {
    warnings.push(
      "VITE_USE_DEMO_DATA=true đang bật trong cấu hình production. Người dùng sẽ thấy dữ liệu demo thay vì dữ liệu thật. " +
        "Không được triển khai production với cờ này.",
    );
  }

  if (isProductionEnv && legacyMockFallbackConfigured) {
    warnings.push(
      "VITE_ENABLE_MOCK_FALLBACK=true đang bật trong cấu hình production. Cờ legacy này không còn bật fallback dữ liệu ở runtime; hãy gỡ khỏi cấu hình để tránh hiểu nhầm khi vận hành.",
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
