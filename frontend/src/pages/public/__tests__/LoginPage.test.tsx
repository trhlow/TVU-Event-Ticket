import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../services/authService", () => ({
  authService: { me: vi.fn(), loginWithMicrosoft: vi.fn(), loginWithDevStub: vi.fn(), logout: vi.fn() },
}));

async function renderLoginPage() {
  const { default: LoginPage } = await import("../LoginPage");
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LoginPage with the default (microsoft) provider", () => {
  it("shows a single, role-neutral Microsoft login button and no DevStub panel", async () => {
    await renderLoginPage();
    expect(screen.getByRole("button", { name: /Đăng nhập bằng tài khoản Microsoft/i })).toBeInTheDocument();
    expect(screen.queryByText(/DEV ONLY/i)).not.toBeInTheDocument();
  });

  it("never lets the user pick their own role", async () => {
    await renderLoginPage();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/SUPER_ADMIN|ORGANIZER|SINH_VIEN/)).not.toBeInTheDocument();
  });

  it("tells Organizer/Super Admin to use the same Microsoft button instead of a fake internal form", async () => {
    await renderLoginPage();
    expect(screen.queryByPlaceholderText("admin@tvu.edu.vn")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Đăng nhập nội bộ/i })).not.toBeInTheDocument();
    expect(screen.getByText(/do quản trị viên nhà trường cấp sẵn/i)).toBeInTheDocument();
  });
});

describe("LoginPage with the devstub provider", () => {
  it("shows a clearly labeled DEV ONLY panel when VITE_AUTH_PROVIDER=devstub", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_AUTH_PROVIDER", "devstub");
    await renderLoginPage();
    expect(screen.getAllByText(/DEV ONLY/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Đăng nhập thử nghiệm dành riêng cho môi trường phát triển/i)).toBeInTheDocument();
  });
});
