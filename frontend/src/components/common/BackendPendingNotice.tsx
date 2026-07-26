import React from "react";
import { Construction } from "lucide-react";

interface BackendPendingNoticeProps {
  title?: string;
  description: string;
}

export default function BackendPendingNotice({
  title = "Tính năng chưa khả dụng",
  description,
}: BackendPendingNoticeProps) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="icon-float mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-200 text-slate-500">
        <Construction className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-black text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">{description}</p>
    </div>
  );
}
