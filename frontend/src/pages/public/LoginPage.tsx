import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ChevronRight, Eye, LockKeyhole, Mail, ShieldCheck, TicketCheck } from "lucide-react";
import Toast from "../../components/common/Toast";
import { mockAuthAccounts, setCurrentUser } from "../../data/mockAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const isDev = import.meta.env.DEV;
  const [internalEmail, setInternalEmail] = useState("");
  const [internalPassword, setInternalPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const handleStudentSSOLogin = () => {
    setCurrentUser(mockAuthAccounts.SINH_VIEN);
    setToastMsg("Đăng nhập thành công bằng tài khoản Microsoft 365 TVU.");
    setTimeout(() => navigate("/student/home"), 650);
  };

  const handleInternalSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");

    if (!internalEmail.trim() || !internalPassword.trim()) {
      setErrorMsg("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    if (!internalEmail.endsWith("@tvu.edu.vn")) {
      setErrorMsg("Hệ thống chỉ chấp nhận tài khoản thuộc miền @tvu.edu.vn.");
      return;
    }

    if (internalEmail.includes("admin")) {
      setCurrentUser(mockAuthAccounts.SUPER_ADMIN);
      setTimeout(() => navigate("/admin/dashboard"), 650);
      return;
    }

    if (internalEmail.includes("organizer") || internalEmail.includes("clb")) {
      setCurrentUser(mockAuthAccounts.ORGANIZER);
      setTimeout(() => navigate("/organizer/dashboard"), 650);
      return;
    }

    setErrorMsg("Tài khoản hoặc mật khẩu không chính xác.");
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-[#FBF8FF] px-4 py-10">
      <section className="w-full max-w-[448px] rounded-xl border border-[#E3E1EB] bg-white px-8 py-8 text-center shadow-[0_1px_2px_rgba(26,27,34,0.05)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-brand-300">
          <TicketCheck className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-brand-700">TVU Ticket</h1>
        <p className="mt-2 text-lg font-extrabold text-[#1A1B22]">Đăng nhập hệ thống</p>
        <p className="mt-3 text-sm font-medium leading-6 text-[#444653]">
          TVU Event & Ticketing Platform - Nền tảng quản lý sự kiện và vé điện tử dành cho các Câu lạc bộ tại Trường Đại học Trà Vinh.
        </p>

        <button
          type="button"
          onClick={handleStudentSSOLogin}
          className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
        >
          <span className="grid h-5 w-5 shrink-0 grid-cols-2 gap-0.5" aria-hidden="true">
            <span className="bg-[#f25022]" />
            <span className="bg-[#7fba00]" />
            <span className="bg-[#00a4ef]" />
            <span className="bg-[#ffb900]" />
          </span>
          Đăng nhập bằng Microsoft 365
        </button>
        <p className="mt-4 text-xs font-semibold text-[#444653]">Dành cho Sinh viên & Giảng viên TVU</p>
        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
          <ShieldCheck className="mr-1 inline h-4 w-4 align-[-3px]" />
          Hệ thống chỉ chấp nhận tài khoản thuộc miền @tvu.edu.vn.
        </div>

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-[#E3E1EB]" />
          <span className="text-xs font-semibold text-[#444653]">Hoặc dành cho Ban tổ chức</span>
          <div className="h-px flex-1 bg-[#E3E1EB]" />
        </div>

        <form onSubmit={handleInternalSubmit} className="space-y-5 text-left">
          {errorMsg && (
            <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#1A1B22]">Email nội bộ</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#C4C5D5]" />
              <input className="tvu-input pl-11" type="email" value={internalEmail} onChange={(event) => setInternalEmail(event.target.value)} placeholder="admin@tvu.edu.vn" />
            </span>
          </label>
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm font-bold text-[#1A1B22]">
              Mật khẩu
              <button type="button" className="text-xs font-bold text-brand-700">Quên mật khẩu?</button>
            </span>
            <span className="relative block">
              <LockKeyhole className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#C4C5D5]" />
              <input className="tvu-input pl-11 pr-11" type="password" value={internalPassword} onChange={(event) => setInternalPassword(event.target.value)} placeholder="••••••••" />
              <Eye className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#C4C5D5]" />
            </span>
          </label>
          <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-brand-600">
            Đăng nhập quản trị
            <ChevronRight className="h-4 w-4" />
          </button>
        </form>

        {isDev && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-left text-[11px] font-semibold leading-5 text-amber-900">
            Môi trường phát triển: dùng email chứa “organizer”, “clb” hoặc “admin” để kiểm tra phân quyền.
          </div>
        )}
      </section>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
