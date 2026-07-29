import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value);
  }
  return import("../env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateAppEnv", () => {
  it("blocks devstub provider when VITE_APP_ENV=production", async () => {
    const { validateAppEnv } = await loadEnv({ VITE_AUTH_PROVIDER: "devstub", VITE_APP_ENV: "production" });
    const result = validateAppEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes("devstub"))).toBe(true);
  });

  it("passes for microsoft provider in production", async () => {
    const { validateAppEnv } = await loadEnv({ VITE_AUTH_PROVIDER: "microsoft", VITE_APP_ENV: "production" });
    const result = validateAppEnv();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an unrecognized VITE_AUTH_PROVIDER value", async () => {
    const { validateAppEnv } = await loadEnv({ VITE_AUTH_PROVIDER: "not-a-real-provider" });
    const result = validateAppEnv();
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized VITE_APP_ENV value", async () => {
    const { validateAppEnv } = await loadEnv({ VITE_APP_ENV: "staging" });
    const result = validateAppEnv();
    expect(result.ok).toBe(false);
  });

  it("warns but does not block when demo data is enabled in production", async () => {
    const { validateAppEnv } = await loadEnv({
      VITE_AUTH_PROVIDER: "microsoft",
      VITE_APP_ENV: "production",
      VITE_USE_DEMO_DATA: "true",
    });
    const result = validateAppEnv();
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns but does not block when mock fallback is enabled in production", async () => {
    const { validateAppEnv } = await loadEnv({
      VITE_AUTH_PROVIDER: "microsoft",
      VITE_APP_ENV: "production",
      VITE_ENABLE_MOCK_FALLBACK: "true",
    });
    const result = validateAppEnv();
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("allows devstub provider outside production", async () => {
    const { validateAppEnv } = await loadEnv({ VITE_AUTH_PROVIDER: "devstub", VITE_APP_ENV: "development" });
    const result = validateAppEnv();
    expect(result.ok).toBe(true);
  });
});
