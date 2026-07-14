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
  it("shows the Microsoft login button and no DevStub panel", async () => {
    await renderLoginPage();
    expect(screen.getByText(/Sinh viên đăng nhập bằng Microsoft/i)).toBeInTheDocument();
    expect(screen.queryByText(/DEV ONLY/i)).not.toBeInTheDocument();
  });

  it("never lets the user pick their own role", async () => {
    await renderLoginPage();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/SUPER_ADMIN|ORGANIZER|SINH_VIEN/)).not.toBeInTheDocument();
  });

  it("disables the Admin/Organizer credential fields instead of pretending they work", async () => {
    await renderLoginPage();
    const emailField = screen.getByPlaceholderText("admin@tvu.edu.vn");
    expect(emailField).toBeDisabled();
    const submitButton = screen.getByRole("button", { name: /Đăng nhập nội bộ/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/đang chờ backend hỗ trợ cơ chế xác thực an toàn/i)).toBeInTheDocument();
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
