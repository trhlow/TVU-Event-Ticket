import React from "react";
import { LucideIcon } from "lucide-react";

interface StatisticCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtext?: string;
  trend?: {
    type: "up" | "down" | "neutral";
    value: string;
  };
  color?: "primary" | "success" | "warning" | "danger";
}

const styles = {
  primary: "bg-blue-50 text-brand-700 border-blue-100 shadow-blue-500/10",
  success: "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-emerald-500/10",
  warning: "bg-amber-50 text-amber-700 border-amber-100 shadow-amber-500/10",
  danger: "bg-rose-50 text-rose-700 border-rose-100 shadow-rose-500/10",
};

export default function StatisticCard({
  label,
  value,
  icon: Icon,
  subtext,
  trend,
  color = "primary",
}: StatisticCardProps) {
  return (
    <div className="enterprise-card hover-lift overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border shadow-sm ${styles[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {(subtext || trend) && (
        <div className="mt-4 flex items-center justify-between border-t border-blue-50 pt-3">
          {subtext && <span className="text-[11px] font-semibold text-slate-500">{subtext}</span>}
          {trend && (
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-brand-700">
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
