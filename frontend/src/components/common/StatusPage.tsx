import React from "react";
import { LucideIcon } from "lucide-react";

interface StatusPageProps {
  code: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: "info" | "warning" | "danger";
  action?: React.ReactNode;
}

const tones = {
  info: { badge: "border-info-100 bg-info-50 text-brand-700", code: "text-brand-600" },
  warning: { badge: "border-warning-100 bg-warning-50 text-warning-600", code: "text-warning-600" },
  danger: { badge: "border-danger-100 bg-danger-50 text-danger-600", code: "text-danger-600" },
};

/**
 * Shared layout for the 404/403/500 screens. These were three separately
 * hand-built pages that had already drifted apart in button styling; routing
 * them through one component is what keeps them identical from here on.
 */
export default function StatusPage({ code, title, description, icon: Icon, tone = "info", action }: StatusPageProps) {
  const palette = tones[tone];

  return (
    <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="enterprise-card flex w-full max-w-md flex-col items-center gap-6 p-8">
        <div className={`grid h-16 w-16 place-items-center rounded-chip border ${palette.badge}`}>
          <Icon className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className={`text-[11px] font-extrabold uppercase tracking-[0.16em] ${palette.code}`}>{code}</p>
          <h1 className="tvu-page-title text-2xl">{title}</h1>
          <p className="text-sm font-medium leading-6 text-slate-500">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
