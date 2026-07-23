import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { User } from "../../../types/user";

const listAllRemote = vi.fn();
const verifyMssv = vi.fn();

vi.mock("../../../services/userService", () => ({
  userService: {
    listAllRemote: (...args: unknown[]) => listAllRemote(...args),
    verifyMssv: (...args: unknown[]) => verifyMssv(...args),
  },
}));

const unverifiedStudent: User = {
  id: "u1",
  fullName: "Nguyen Van A",
  email: "a@example.com",
  role: "SINH_VIEN",
  mssv: "110122001",
  className: "DA21CNTT",
  mssvStatus: "UNVERIFIED",
  profileComplete: true,
  status: "ACTIVE",
};

async function renderPage() {
  const { default: SuperAdminStudentsPage } = await import("../SuperAdminStudentsPage");
  return render(
    <MemoryRouter>
      <SuperAdminStudentsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listAllRemote.mockReset();
  verifyMssv.mockReset();
});

describe("SuperAdminStudentsPage MSSV verification", () => {
  it("verifies an unverified student's MSSV through the admin action", async () => {
    listAllRemote
      .mockResolvedValueOnce([unverifiedStudent])
      .mockResolvedValueOnce([{ ...unverifiedStudent, mssvStatus: "VERIFIED" }]);
    verifyMssv.mockResolvedValue(undefined);

    await renderPage();

    // DataTable renders each row in both a desktop and a mobile layout, so the action button appears
    // more than once; the table row action is the first, the modal confirm button is the last.
    const actionButtons = await screen.findAllByRole("button", { name: /Xác minh MSSV/i });
    fireEvent.click(actionButtons[0]);

    // The confirmation modal opens with its own (unique) title.
    await screen.findByText(/Xác minh MSSV sinh viên/i);
    const buttons = screen.getAllByRole("button", { name: /Xác minh MSSV/i });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(verifyMssv).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(listAllRemote).toHaveBeenCalledTimes(2)); // initial load + refresh after verify
  });

  it("does not offer verification for a student who has no MSSV yet", async () => {
    listAllRemote.mockResolvedValue([
      { ...unverifiedStudent, id: "u2", mssv: undefined, mssvStatus: undefined, profileComplete: false },
    ]);

    await renderPage();

    expect((await screen.findAllByText(/CHƯA CÓ MSSV/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Xác minh MSSV/i })).not.toBeInTheDocument();
  });
});
