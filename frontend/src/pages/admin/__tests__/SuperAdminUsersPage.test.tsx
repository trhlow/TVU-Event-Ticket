import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SuperAdminUsersPage from "../SuperAdminUsersPage";

describe("SuperAdminUsersPage", () => {
  it("shows an honest 'waiting on backend' state instead of fake role-escalation controls", () => {
    render(<SuperAdminUsersPage />);

    expect(screen.getByText(/Tính năng đang chờ API backend/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cấp quyền BTC/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hạ quyền SV/i)).not.toBeInTheDocument();
  });
});
