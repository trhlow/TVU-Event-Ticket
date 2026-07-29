export type AppEnvironment = "development" | "production";

export interface EnvValidationResult {
  ok: boolean;
  errors: string[];
}

const VALID_APP_ENVS: AppEnvironment[] = ["development", "production"];

const rawAppEnv = (import.meta.env.VITE_APP_ENV as string | undefined)?.trim().toLowerCase();

// Falls back to Vite's own production flag when VITE_APP_ENV isn't set explicitly, so a plain
// `vite build` is still treated as production even if the operator forgot to set the variable.
export const appEnv: AppEnvironment =
  rawAppEnv === "production" || rawAppEnv === "development" ? rawAppEnv : import.meta.env.PROD ? "production" : "development";
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";

export function validateAppEnv(): EnvValidationResult {
  const errors: string[] = [];

  if (rawAppEnv && !VALID_APP_ENVS.includes(rawAppEnv as AppEnvironment)) {
    errors.push(`VITE_APP_ENV="${rawAppEnv}" không hợp lệ. Chỉ chấp nhận: ${VALID_APP_ENVS.join(", ")}.`);
  }

  return { ok: errors.length === 0, errors };
}
