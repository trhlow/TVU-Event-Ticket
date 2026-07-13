import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ChevronRight, Loader2, Mail, ShieldCheck, TicketCheck } from "lucide-react";
import Toast from "../../components/common/Toast";
import { authService } from "../../services/authService";

const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || (import.meta.env.DEV ? "devstub" : "microsoft")).toLowerCase();
const isDevStubEnabled = authProvider === "devstub";
const isMicrosoftLoginEnabled = authProvider === "microsoft";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [internalEmail, setInternalEmail] = useState("");
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
    if (params.get("auth") === "success") {
      navigate(location.pathname, { replace: true });
      void authService.me().then((user) => {
        if (!user) return;
        const nextPath =
          user.role === "SUPER_ADMIN" ? "/admin/dashboard" : user.role === "ORGANIZER" ? "/organizer/dashboard" : "/student/home";
        navigate(nextPath, { replace: true });
      }).catch(() => {
        setErrorMsg("Không thể xác minh phiên đăng nhập Microsoft. Vui lòng thử lại.");
      });
    }
  }, [location.pathname, location.search, navigate]);

  const handleMicrosoftLogin = async () => {
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      await authService.loginWithMicrosoft();
      setToastMsg("Đang chuyển tới Microsoft 365.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể đăng nhập. Vui lòng thử lại.");
      setIsSubmitting(false);
    }
  };

  const handleDevStubSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");

    const normalizedEmail = internalEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg("Vui lòng nhập email thử nghiệm.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMsg("Email không đúng định dạng.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await authService.loginWithDevStub(normalizedEmail);
      const nextPath =
        user.role === "SUPER_ADMIN" ? "/admin/dashboard" : user.role === "ORGANIZER" ? "/organizer/dashboard" : "/student/home";
      setTimeout(() => navigate(nextPath), 650);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể đăng nhập thử nghiệm.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.14),transparent_28rem),radial-gradient(circle_at_80%_20%,rgba(6,182,212,0.12),transparent_28rem)]" />
      <section className="enterprise-card relative z-10 grid w-full max-w-[980px] overflow-hidden p-0 lg:grid-cols-[1fr_448px]">
        <div className="hidden bg-gradient-to-br from-brand-800 via-brand-600 to-accent-500 p-9 text-white lg:block">
          <div className="flex items-center gap-3">
            <img src="/src/assets/images/tvu_logo_1783065060265.jpg" alt="TVU" className="h-12 w-12 rounded-2xl bg-white object-contain p-1.5" />
            <div>
              <p className="font-display text-2xl font-extrabold">TVU Ticket</p>
              <p className="text-sm font-semibold text-white/75">Event & Ticketing Platform</p>
            </div>
          </div>
          <div className="mt-14 rounded-3xl border border-white/18 bg-white/12 p-6 backdrop-blur">
            <TicketCheck className="h-12 w-12 text-white" />
            <h2 className="mt-5 font-display text-3xl font-extrabold leading-tight">Quản lý sự kiện CLB minh bạch, nhanh và an toàn.</h2>
            <p className="mt-4 text-sm font-medium leading-7 text-white/78">
              Sinh viên đăng ký bằng Microsoft 365, Ban tổ chức duyệt đăng ký và phát hành vé QR qua một quy trình thống nhất.
            </p>
          </div>
          <p className="mt-12 text-xs font-semibold text-white/65">© 2026 Trường Đại học Trà Vinh</p>
        </div>

        <div className="bg-white px-6 py-8 text-center sm:px-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-600 text-white shadow-lg shadow-brand-700/25">
            <TicketCheck className="h-8 w-8" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold text-brand-800">TVU Ticket</h1>
          <p className="mt-2 text-xl font-extrabold text-slate-950">Đăng nhập hệ thống</p>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
            Nền tảng quản lý sự kiện và vé điện tử dành cho các Câu lạc bộ tại Trường Đại học Trà Vinh.
          </p>

          <button
            type="button"
            onClick={isMicrosoftLoginEnabled ? handleMicrosoftLogin : undefined}
            disabled={isSubmitting || !isMicrosoftLoginEnabled}
            title={isMicrosoftLoginEnabled ? undefined : "Đăng nhập Microsoft chỉ bật khi VITE_AUTH_PROVIDER=microsoft"}
            className="btn-press mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-brand-700 px-4 text-sm font-bold text-white shadow-lg shadow-brand-700/20 hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="grid h-5 w-5 shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
              <span className="bg-[#f25022]" />
              <span className="bg-[#7fba00]" />
              <span className="bg-[#00a4ef]" />
              <span className="bg-[#ffb900]" />
            </span>
            {isSubmitting && isMicrosoftLoginEnabled ? "Đang chuyển hướng..." : "Đăng nhập bằng Microsoft 365"}
          </button>
          {!isMicrosoftLoginEnabled && (
            <div className="mt-3 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Microsoft OAuth đang tắt trong cấu hình frontend hiện tại. Local demo dùng DevStub riêng bên dưới.</span>
            </div>
          )}
          <div className="mt-3 rounded-2xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800">
            <ShieldCheck className="mr-1 inline h-4 w-4 align-[-3px]" />
            Phiên đăng nhập được xác thực bằng cookie HttpOnly từ backend.
          </div>

          {errorMsg && !isDevStubEnabled && (
            <div className="mt-5 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-left text-xs font-semibold text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isDevStubEnabled && (
            <>
              <div className="my-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-500">Đăng nhập thử nghiệm</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form onSubmit={handleDevStubSubmit} noValidate className="space-y-5 text-left">
                {errorMsg && (
                  <div className="flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-900">Email DevStub</span>
                  <span className="relative block">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      className="tvu-input pl-11"
                      type="email"
                      value={internalEmail}
                      onChange={(event) => setInternalEmail(event.target.value)}
                      placeholder="qa.student@tvu.edu.vn"
                      autoComplete="username"
                    />
                  </span>
                </label>
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                  Chỉ dùng cho local development/test. Backend DevStub xác thực bằng email hợp lệ và không sử dụng mật khẩu.
                </p>
                <button type="submit" disabled={isSubmitting} className="btn-press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập thử nghiệm"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
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
