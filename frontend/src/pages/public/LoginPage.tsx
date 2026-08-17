import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AlertCircle, ArrowLeft, FlaskConical, Mail } from "lucide-react";
import Toast from "../../components/common/Toast";
import { authService } from "../../services/authService";
import { User } from "../../types/user";
import { isDevStubProvider, isMicrosoftProvider } from "../../lib/env";

function homePathForRole(role: User["role"]): string {
  if (role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "ORGANIZER") return "/organizer/dashboard";
  return "/student/home";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget = (location.state as { from?: string } | null)?.from;
  const resolveDestination = useCallback(
    (role: User["role"]) => redirectTarget || homePathForRole(role),
    [redirectTarget],
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devCredential, setDevCredential] = useState("");
  const [devDisplayName, setDevDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authError = params.get("error");

    if (authError) {
      setErrorMsg(oauthErrorMessage(authError));
      navigate(location.pathname, { replace: true });
      return;
    }

    if (params.get("auth") !== "success") return;

    navigate(location.pathname, { replace: true });
    void authService
      .me()
      .then((user) => {
        if (user) navigate(resolveDestination(user.role), { replace: true });
      })
      .catch(() => {
        setErrorMsg("Không thể xác minh phiên đăng nhập. Vui lòng thử lại.");
      });
  }, [location.pathname, location.search, navigate, resolveDestination]);

  const handleMicrosoftLogin = async () => {
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const user = await authService.loginWithMicrosoft();
      navigate(resolveDestination(user.role), { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể đăng nhập bằng Microsoft. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");
    if (!adminEmail.trim()) {
      setErrorMsg("Nhập email tài khoản quản trị để nhận mã.");
      return;
    }
    setIsSubmitting(true);
    try {
      await authService.requestOtp(adminEmail);
      // The backend answers the same whether or not the address is an admin, so the UI says the same too.
      setOtpSent(true);
      setToastMsg("Nếu email hợp lệ, mã đăng nhập đã được gửi. Kiểm tra hộp thư.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể gửi mã. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const user = await authService.verifyOtp(adminEmail, otpCode, rememberDevice);
      navigate(resolveDestination(user.role), { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Mã không đúng hoặc đã hết hạn. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  const handleDevStubLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");

    if (!devCredential.trim()) {
      setErrorMsg("Nhập một địa chỉ email hợp lệ để đăng nhập thử nghiệm.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Role is never chosen here — it is whatever role the backend already assigned to this
      // email, read back from GET /auth/me after login (see authService.loginWithDevStub).
      const user = await authService.loginWithDevStub(devCredential, devDisplayName);
      navigate(resolveDestination(user.role), { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể đăng nhập thử nghiệm. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-scene grid min-h-screen place-items-center overflow-hidden px-4 pb-10 pt-20 text-slate-950 sm:py-10">
      <div className="auth-orb h-[380px] w-[380px] bg-cyan-400/60" style={{ top: "-120px", right: "-80px" }} aria-hidden="true" />
      <div className="auth-orb h-[420px] w-[420px] bg-indigo-500/60" style={{ bottom: "-140px", left: "-120px", animationDelay: "-5s" }} aria-hidden="true" />
      <div className="auth-orb h-[260px] w-[260px] bg-blue-400/50" style={{ top: "38%", left: "58%", animationDelay: "-9s" }} aria-hidden="true" />

      <Link
        to="/"
        className="auth-back-link fixed left-4 top-4 z-20 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-700 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Về trang chủ
      </Link>

      <section className="auth-card relative z-10 w-full max-w-[460px] rounded-3xl px-6 py-7 text-center sm:px-8 sm:py-8">
        <div className="auth-logo-glow mx-auto w-fit">
          <img
            src="/logo-tvu.webp?v=20260729"
            alt="Logo Trường Đại học Trà Vinh"
            className="icon-float mx-auto h-[76px] w-[76px] rounded-full border-2 border-white bg-white object-contain p-1.5 shadow-lg shadow-blue-900/20"
          />
        </div>

        <h1 className="mt-5 bg-gradient-to-r from-brand-800 via-brand-600 to-accent-600 bg-clip-text font-display text-2xl font-extrabold leading-tight text-transparent">TVU Ticket</h1>
        <p className="mt-2 text-xl font-extrabold leading-tight text-slate-900">Đăng nhập hệ thống</p>

        {errorMsg && (
          <div className="mt-6 flex gap-2 rounded-card border border-rose-200 bg-rose-50 px-3 py-3 text-left text-xs font-semibold leading-5 text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mt-6 rounded-card border border-slate-200 bg-slate-50/70 p-4 text-left">
          {!otpSent ? (
            <form onSubmit={handleRequestOtp} className="space-y-3">
              <div className="relative">
                {/* Label is visually replaced by the icon inside the field, but stays in the
                    accessibility tree -- an input whose only cue is a decorative glyph has no
                    accessible name at all for a screen reader. */}
                <label htmlFor="login-email" className="sr-only">
                  Email
                </label>
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  className="tvu-input min-h-11 rounded-control pl-11 text-sm font-medium"
                  autoComplete="username"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-press flex min-h-11 w-full items-center justify-center rounded-control bg-gradient-to-r from-brand-700 to-brand-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-brand-700/25 hover:from-brand-800 hover:to-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Đang gửi..." : "Gửi mã đăng nhập"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <label htmlFor="login-otp" className="block text-xs font-bold text-slate-700">
                Mã đăng nhập (OTP)
              </label>
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="tvu-input min-h-11 rounded-control text-center text-lg font-bold tracking-[0.3em]"
                autoComplete="one-time-code"
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Ghi nhớ thiết bị này (duy trì phiên đăng nhập lâu hơn)
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-press flex min-h-11 w-full items-center justify-center rounded-control bg-gradient-to-r from-brand-700 to-brand-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-brand-700/25 hover:from-brand-800 hover:to-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Đang xác minh..." : "Xác minh và đăng nhập"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  // Without this the "mã không đúng" banner from the verify step follows the
                  // user back to the email step, reporting a failure they just abandoned.
                  setErrorMsg("");
                }}
                className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Dùng email khác
              </button>
            </form>
          )}
        </div>

        {isMicrosoftProvider && (
          <>
            <div className="my-5 flex items-center gap-3" role="separator" aria-label="Hoặc">
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">hoặc</span>
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            </div>
            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={isSubmitting}
              className="btn-press flex min-h-12 w-full items-center justify-center gap-3 rounded-control bg-[#2848b8] px-4 text-sm font-bold text-white shadow-lg shadow-[#2848b8]/30 hover:bg-[#1f3fa8] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="grid h-5 w-5 shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
                <span className="bg-[#f25022]" />
                <span className="bg-[#7fba00]" />
                <span className="bg-[#00a4ef]" />
                <span className="bg-[#ffb900]" />
              </span>
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập bằng tài khoản Microsoft"}
            </button>
          </>
        )}

        {/* import.meta.env.DEV is a build-time literal: Vite/Rollup dead-code-eliminates this
            entire branch from a `vite build` production bundle, so it cannot ship even if
            VITE_AUTH_PROVIDER is misconfigured at runtime. */}
        {import.meta.env.DEV && isDevStubProvider && (
          <div className="mt-8 rounded-card border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-left">
            <div className="flex items-center gap-2 text-amber-800">
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-[11px] font-black uppercase tracking-[0.14em]">DEV ONLY · Đăng nhập thử nghiệm</span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-amber-900">
              Đây là đăng nhập thử nghiệm dành riêng cho môi trường phát triển cục bộ, không phải cơ chế xác thực production. Backend
              chấp nhận bất kỳ email hợp lệ nào, không kiểm tra mật khẩu. Vai trò trả về sau khi đăng nhập là vai trò backend đã gán
              sẵn cho email đó — form này không cho bạn tự chọn vai trò.
            </p>
            <form onSubmit={handleDevStubLogin} className="mt-4 space-y-3">
              <input
                type="email"
                value={devCredential}
                onChange={(event) => setDevCredential(event.target.value)}
                placeholder="ten@vidu.dev"
                className="tvu-input min-h-11 rounded-control text-sm font-medium"
                autoComplete="off"
              />
              <input
                type="text"
                value={devDisplayName}
                onChange={(event) => setDevDisplayName(event.target.value)}
                placeholder="Tên hiển thị (tuỳ chọn)"
                className="tvu-input min-h-11 rounded-control text-sm font-medium"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-press flex min-h-11 w-full items-center justify-center rounded-control bg-amber-600 px-4 text-sm font-extrabold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập thử nghiệm (DEV ONLY)"}
              </button>
            </form>
          </div>
        )}

      </section>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </main>
  );
}

function oauthErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    oauth_state_invalid: "Phiên đăng nhập Microsoft đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.",
    oauth_nonce_invalid: "Không thể xác minh phiên Microsoft. Vui lòng đăng nhập lại.",
    oauth_code_exchange_failed: "Không thể hoàn tất đăng nhập Microsoft. Vui lòng thử lại.",
    oauth_tenant_not_allowed: "Tài khoản Microsoft không thuộc tenant được phép.",
    oauth_email_not_allowed: "Email Microsoft không thuộc miền được phép.",
    oauth_account_not_registered: "Tài khoản chưa được đăng ký trong hệ thống.",
    oauth_account_locked: "Tài khoản đang bị khóa.",
    oauth_provider_error: "Microsoft từ chối yêu cầu đăng nhập.",
  };
  return messages[code] || "Không thể đăng nhập bằng Microsoft. Vui lòng thử lại.";
}
