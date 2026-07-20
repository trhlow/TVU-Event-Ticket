import React from "react";
import { AlertOctagon } from "lucide-react";

interface EnvConfigErrorScreenProps {
  errors: string[];
}

export default function EnvConfigErrorScreen({ errors }: EnvConfigErrorScreenProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-rose-500/40 bg-slate-900 p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-400">
            <AlertOctagon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-rose-400">Lỗi cấu hình môi trường</p>
            <h1 className="text-xl font-extrabold text-white">Ứng dụng không thể khởi động</h1>
          </div>
        </div>

        <p className="mt-5 text-sm font-medium leading-6 text-slate-300">
          Biến môi trường frontend đang ở trạng thái không an toàn hoặc không hợp lệ. Ứng dụng chủ động dừng lại thay vì chạy với
          cấu hình có thể gây rò rỉ chế độ phát triển (DevStub) hoặc dữ liệu demo vào môi trường thật.
        </p>

        <ul className="mt-5 space-y-3">
          {errors.map((error, index) => (
            <li key={index} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold leading-6 text-rose-100">
              {error}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs font-semibold leading-5 text-slate-400">
          Kiểm tra lại các biến <code className="rounded bg-slate-800 px-1.5 py-0.5">VITE_AUTH_PROVIDER</code>,{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">VITE_APP_ENV</code>,{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">VITE_USE_DEMO_DATA</code> và{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">VITE_ENABLE_MOCK_FALLBACK</code> trong file cấu hình môi trường
          (xem <code className="rounded bg-slate-800 px-1.5 py-0.5">frontend/.env.example</code>) rồi build lại.
        </p>
      </section>
    </main>
  );
}
