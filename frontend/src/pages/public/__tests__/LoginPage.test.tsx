import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../../services/authService", () => ({
  authService: {
    me: vi.fn(),
    loginWithMicrosoft: vi.fn(),
    loginWithDevStub: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    logout: vi.fn(),
  },
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

describe("LoginPage with the default Microsoft provider", () => {
  it("shows the role-neutral Microsoft login button and no DevStub panel", async () => {
    await renderLoginPage();
    expect(screen.getByRole("button", { name: /Đăng nhập bằng tài khoản Microsoft/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /Hoặc/i })).toBeInTheDocument();
    expect(screen.queryByText(/DEV ONLY/i)).not.toBeInTheDocument();
  });

  it("never lets the user choose their own role", async () => {
    await renderLoginPage();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText(/SUPER_ADMIN|ORGANIZER|SINH_VIEN/)).not.toBeInTheDocument();
  });

  it("offers backend OTP login for Organizer and Super Admin without a password field", async () => {
    await renderLoginPage();
    expect(screen.getByRole("button", { name: /Gửi mã đăng nhập/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Email$/i })).toHaveAttribute("type", "email");
    expect(screen.queryByPlaceholderText("email-clb@vidu.com")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/mật khẩu/i)).not.toBeInTheDocument();
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
