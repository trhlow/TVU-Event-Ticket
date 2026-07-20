import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../ProtectedRoute";
import { setCurrentUser } from "../../state/authSession";
import { ApiError } from "../../services/apiClient";
import { authService } from "../../services/authService";
import { User } from "../../types/user";

vi.mock("../../services/authService", () => ({
  authService: { me: vi.fn() },
}));

const student: User = { id: "u1", fullName: "Sinh vien A", email: "a@tvu.edu.vn", role: "SINH_VIEN", profileComplete: true, status: "ACTIVE" };
const organizer: User = { id: "u2", fullName: "BTC A", email: "btc@tvu.edu.vn", role: "ORGANIZER", clubId: "c1", profileComplete: true, status: "ACTIVE" };

function renderProtected(allowedRoles?: User["role"][]) {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/403" element={<div>403 page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    setCurrentUser(null);
    vi.mocked(authService.me).mockReset();
  });

  afterEach(() => {
    setCurrentUser(null);
  });

  it("redirects to /login when there is no session (backend says 401)", async () => {
    vi.mocked(authService.me).mockRejectedValue(new ApiError("Phien dang nhap da het han.", 401));
    renderProtected(["SINH_VIEN"]);
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
  });

  it("redirects a student to /403 on an organizer-only route", async () => {
    setCurrentUser(student);
    renderProtected(["ORGANIZER"]);
    await waitFor(() => expect(screen.getByText("403 page")).toBeInTheDocument());
  });

  it("redirects an organizer to /403 on an admin-only route", async () => {
    setCurrentUser(organizer);
    renderProtected(["SUPER_ADMIN"]);
    await waitFor(() => expect(screen.getByText("403 page")).toBeInTheDocument());
  });

  it("renders the route when the cached user has the allowed role", async () => {
    setCurrentUser(student);
    renderProtected(["SINH_VIEN"]);
    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
  });

  it("shows a connection-error state (not /login, not fabricated data) when the backend is unreachable", async () => {
    vi.mocked(authService.me).mockRejectedValue(new ApiError("Khong the ket noi may chu.", 0));
    renderProtected(["SINH_VIEN"]);
    await waitFor(() => expect(screen.getByText(/Không thể kết nối máy chủ/i)).toBeInTheDocument());
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
