import { beforeEach, describe, expect, it, vi } from "vitest";

const { broadcastResponseToMainFrame } = vi.hoisted(() => ({
  broadcastResponseToMainFrame: vi.fn(() => Promise.resolve()),
}));

vi.mock("@azure/msal-browser/redirect-bridge", () => ({
  broadcastResponseToMainFrame,
}));

describe("Microsoft popup redirect bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    broadcastResponseToMainFrame.mockClear();
  });

  it("forwards the authorization response back to the tab that opened the popup", async () => {
    await import("../authRedirect");

    expect(broadcastResponseToMainFrame).toHaveBeenCalledOnce();
  });
});
