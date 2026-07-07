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
    <div className="enterprise-card hover-lift p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-lg ${styles[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {(subtext || trend) && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {subtext && <span className="text-[11px] font-semibold text-slate-500">{subtext}</span>}
          {trend && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
