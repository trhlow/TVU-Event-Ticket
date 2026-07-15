import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, FlaskConical, ShieldCheck, TicketCheck } from "lucide-react";
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
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devCredential, setDevCredential] = useState("");
  const [devDisplayName, setDevDisplayName] = useState("");

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
      navigate(homePathForRole(user.role), { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể đăng nhập thử nghiệm. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
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
          Sinh viên, Ban tổ chức và Quản trị viên đều đăng nhập chung bằng tài khoản Microsoft của trường. Vai trò và quyền truy cập luôn do backend quyết định sau khi xác thực, frontend không cho chọn vai trò.
        </p>

        {errorMsg && (
          <div className="mt-6 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-left text-xs font-semibold leading-5 text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isMicrosoftProvider && (
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={isSubmitting}
            className="btn-press mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#2848b8] px-4 text-sm font-bold text-white shadow-sm shadow-blue-900/15 hover:bg-[#1f3fa8] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="grid h-5 w-5 shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
              <span className="bg-[#f25022]" />
              <span className="bg-[#7fba00]" />
              <span className="bg-[#00a4ef]" />
              <span className="bg-[#ffb900]" />
            </span>
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập bằng tài khoản Microsoft"}
          </button>
        )}

        {/* import.meta.env.DEV is a build-time literal: Vite/Rollup dead-code-eliminates this
            entire branch from a `vite build` production bundle, so it cannot ship even if
            VITE_AUTH_PROVIDER is misconfigured at runtime. */}
        {import.meta.env.DEV && isDevStubProvider && (
          <div className="mt-8 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-left">
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
                className="tvu-input min-h-11 rounded-lg text-sm font-medium"
                autoComplete="off"
              />
              <input
                type="text"
                value={devDisplayName}
                onChange={(event) => setDevDisplayName(event.target.value)}
                placeholder="Tên hiển thị (tuỳ chọn)"
                className="tvu-input min-h-11 rounded-lg text-sm font-medium"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-press flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-extrabold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập thử nghiệm (DEV ONLY)"}
              </button>
            </form>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-brand-800">
          <ShieldCheck className="mr-1 inline h-4 w-4 align-[-3px]" />
          Role luôn lấy từ backend profile/session. Frontend không cho chọn role và không lưu JWT/token vào localStorage hoặc sessionStorage.
        </div>

        <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 text-left text-xs font-semibold leading-5 text-brand-900">
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            Tài khoản Ban tổ chức CLB và Quản trị viên do quản trị viên nhà trường cấp sẵn — đăng nhập bằng đúng nút Microsoft phía trên,
            không có bước đăng ký hay biểu mẫu riêng. Nếu tài khoản Microsoft của bạn chưa được cấp quyền, hệ thống sẽ báo lỗi cụ thể sau khi đăng nhập.
          </span>
        </div>
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
