import React from "react";
import { LucideIcon } from "lucide-react";
import { useCardTilt } from "../../hooks/useCardTilt";
import { useCountUp } from "../../hooks/useCountUp";

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
  primary: "bg-info-50 text-brand-700 border-info-100 shadow-info-500/10",
  success: "bg-success-50 text-success-700 border-success-100 shadow-success-500/10",
  warning: "bg-warning-50 text-warning-700 border-warning-100 shadow-warning-500/10",
  danger: "bg-danger-50 text-danger-700 border-danger-100 shadow-danger-500/10",
};

export default function StatisticCard({ label, value, icon: Icon, subtext, trend, color = "primary" }: StatisticCardProps) {
  const tiltRef = useCardTilt<HTMLDivElement>({ maxTilt: 4 });
  const numericValue = typeof value === "number" ? value : Number.parseInt(value, 10);
  const isCountable = typeof value === "number" || (!Number.isNaN(numericValue) && String(numericValue) === value);
  const { ref: counterRef, display } = useCountUp(isCountable ? numericValue : 0);

  return (
    <div ref={tiltRef} className="enterprise-card tilt-card relative overflow-hidden p-4">
      <div className="tilt-card-sheen" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-slate-950">
            {isCountable ? (
              <span ref={counterRef} className="stat-value-pop">
                {display.toLocaleString("vi-VN")}
              </span>
            ) : (
              value
            )}
          </p>
        </div>
        <div className={`stat-icon-depth grid h-11 w-11 shrink-0 place-items-center rounded-2xl border shadow-sm ${styles[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {(subtext || trend) && (
        <div className="relative mt-4 flex items-center justify-between border-t border-info-50 pt-3">
          {subtext && <span className="text-[11px] font-semibold text-slate-500">{subtext}</span>}
          {trend && (
            <span className="rounded-full bg-info-50 px-2 py-1 text-[10px] font-bold text-brand-700">
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
