import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Lock, Mail, ShieldCheck, TicketCheck } from "lucide-react";
import Toast from "../../components/common/Toast";
import { authService } from "../../services/authService";
import { User } from "../../types/user";

const isMicrosoftLoginEnabled = (import.meta.env.VITE_AUTH_PROVIDER || "microsoft").toLowerCase() === "microsoft";

function homePathForRole(role: User["role"]): string {
  if (role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "ORGANIZER") return "/organizer/dashboard";
  return "/student/home";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [internalEmail, setInternalEmail] = useState("");
  const [internalPassword, setInternalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        if (user) navigate(homePathForRole(user.role), { replace: true });
      })
      .catch(() => {
        setErrorMsg("Không thể xác minh phiên đăng nhập. Vui lòng thử lại.");
      });
  }, [location.pathname, location.search, navigate]);

  const handleMicrosoftLogin = async () => {
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const user = await authService.loginWithMicrosoft();
      navigate(homePathForRole(user.role), { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể đăng nhập bằng Microsoft. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  const handleInternalSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");

    if (!internalEmail.trim() || !internalPassword.trim()) {
      setErrorMsg("Vui lòng nhập email và mật khẩu nội bộ.");
      return;
    }

    setErrorMsg(
      "Backend hiện chưa hỗ trợ đăng nhập nội bộ bằng email + mật khẩu. Không thể đăng nhập Admin/Ban tổ chức an toàn cho đến khi backend có contract mật khẩu hoặc invite/reset password.",
    );
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#fbf8ff] px-4 py-8 text-slate-950">
      <section className="w-full max-w-[460px] rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:px-8 sm:py-9">
        <div className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-full bg-brand-700 text-white shadow-lg shadow-brand-700/20">
          <TicketCheck className="h-8 w-8" aria-hidden="true" />
        </div>

        <h1 className="mt-6 font-display text-2xl font-extrabold leading-tight text-brand-800">TVU Ticket</h1>
        <p className="mt-3 text-xl font-extrabold leading-tight text-slate-900">Đăng nhập hệ thống</p>
        <p className="mx-auto mt-3 max-w-[340px] text-sm font-medium leading-6 text-slate-600">
          Sinh viên dùng Microsoft OAuth/OIDC. Admin và Ban tổ chức phải dùng tài khoản nội bộ email + mật khẩu khi backend hỗ trợ.
        </p>

        {errorMsg && (
          <div className="mt-6 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-left text-xs font-semibold leading-5 text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={isMicrosoftLoginEnabled ? handleMicrosoftLogin : undefined}
          disabled={isSubmitting || !isMicrosoftLoginEnabled}
          className="btn-press mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#2848b8] px-4 text-sm font-bold text-white shadow-sm shadow-blue-900/15 hover:bg-[#1f3fa8] disabled:cursor-not-allowed disabled:opacity-70"
          title={isMicrosoftLoginEnabled ? undefined : "Microsoft OAuth chỉ bật khi VITE_AUTH_PROVIDER=microsoft"}
        >
          <span className="grid h-5 w-5 shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
            <span className="bg-[#f25022]" />
            <span className="bg-[#7fba00]" />
            <span className="bg-[#00a4ef]" />
            <span className="bg-[#ffb900]" />
          </span>
          {isSubmitting && isMicrosoftLoginEnabled ? "Đang đăng nhập..." : "Sinh viên đăng nhập bằng Microsoft"}
        </button>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-brand-800">
          <ShieldCheck className="mr-1 inline h-4 w-4 align-[-3px]" />
          Role luôn lấy từ backend profile/session. Frontend không cho chọn role và không lưu JWT/token vào localStorage hoặc sessionStorage.
        </div>

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="shrink-0 text-xs font-bold text-slate-500">Admin / Ban tổ chức</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleInternalSubmit} noValidate className="space-y-5 text-left">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-800">Email nội bộ</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                className="tvu-input min-h-12 rounded-lg pl-11 text-base font-medium placeholder:text-slate-400"
                type="email"
                value={internalEmail}
                onChange={(event) => setInternalEmail(event.target.value)}
                placeholder="admin@tvu.edu.vn"
                autoComplete="username"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-800">Mật khẩu nội bộ</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                className="tvu-input min-h-12 rounded-lg px-11 text-base font-medium placeholder:text-slate-400"
                type={showPassword ? "text" : "password"}
                value={internalPassword}
                onChange={(event) => setInternalPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-brand-700"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </span>
          </label>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            Backend `LoginRequest` hiện chỉ có `credential/displayName`, chưa có `password`. Vì vậy frontend không gửi đăng nhập nội bộ email-only và chưa thể xác thực Admin/Ban tổ chức an toàn.
          </p>

          <button
            type="submit"
            className="btn-press flex min-h-12 w-full items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-slate-900"
          >
            Kiểm tra đăng nhập nội bộ
          </button>
        </form>
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
