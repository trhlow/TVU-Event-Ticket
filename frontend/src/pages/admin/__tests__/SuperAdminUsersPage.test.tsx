import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../../services/userService", () => ({
  userService: { listAllRemote: vi.fn().mockResolvedValue([]) },
}));

async function renderPage() {
  const { default: SuperAdminUsersPage } = await import("../SuperAdminUsersPage");
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <SuperAdminUsersPage />
      </MemoryRouter>,
    );
  });
  return utils;
}

describe("SuperAdminUsersPage", () => {
  it("renders the real user directory without fake role-escalation controls", async () => {
    await renderPage();

    expect(await screen.findByText(/Danh sách người dùng hệ thống/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cấp quyền BTC/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hạ quyền SV/i)).not.toBeInTheDocument();
  });
});
