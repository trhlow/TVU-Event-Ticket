import React from "react";
import { Construction } from "lucide-react";

interface BackendPendingNoticeProps {
  title?: string;
  description: string;
  requiredEndpoints?: string[];
}

export default function BackendPendingNotice({
  title = "Tính năng đang chờ API backend",
  description,
  requiredEndpoints,
}: BackendPendingNoticeProps) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="icon-float mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-200 text-slate-500">
        <Construction className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-black text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">{description}</p>

      {requiredEndpoints && requiredEndpoints.length > 0 && (
        <div className="mx-auto mt-5 max-w-md rounded-xl border border-slate-200 bg-white p-4 text-left">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">API cần bổ sung (thông tin dành cho dev)</p>
          <ul className="mt-2 space-y-1">
            {requiredEndpoints.map((endpoint) => (
              <li key={endpoint} className="font-mono text-xs font-bold text-slate-600">
                {endpoint}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
