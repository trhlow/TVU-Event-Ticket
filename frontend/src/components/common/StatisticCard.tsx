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

/** Full-tile tint + icon chip per colour role. The tile itself carries the colour,
 *  which is what makes a row of four read as one unit at a glance. */
const tones = {
  primary: { tile: "bg-info-50", chip: "bg-info-500 text-white", value: "text-brand-900" },
  success: { tile: "bg-success-50", chip: "bg-success-500 text-white", value: "text-success-700" },
  warning: { tile: "bg-warning-50", chip: "bg-warning-500 text-white", value: "text-warning-700" },
  danger: { tile: "bg-danger-50", chip: "bg-danger-500 text-white", value: "text-danger-700" },
};

const trendTones = {
  up: "text-success-700",
  down: "text-danger-600",
  neutral: "text-slate-500",
};

export default function StatisticCard({ label, value, icon: Icon, subtext, trend, color = "primary" }: StatisticCardProps) {
  const tiltRef = useCardTilt<HTMLDivElement>({ maxTilt: 4 });
  const numericValue = typeof value === "number" ? value : Number.parseInt(value, 10);
  const isCountable = typeof value === "number" || (!Number.isNaN(numericValue) && String(numericValue) === value);
  const { ref: counterRef, display } = useCountUp(isCountable ? numericValue : 0);
  const tone = tones[color];

  return (
    <div
      ref={tiltRef}
      className={`tilt-card relative overflow-hidden rounded-card border border-white/60 p-section ${tone.tile}`}
    >
      <div className="tilt-card-sheen" aria-hidden="true" />

      <div className={`stat-icon-depth relative grid h-11 w-11 place-items-center rounded-control shadow-sm ${tone.chip}`}>
        <Icon className="h-5 w-5" />
      </div>

      {isCountable ? (
        <p className={`relative mt-4 font-display text-3xl font-extrabold tracking-tight ${tone.value}`}>
          <span ref={counterRef} className="stat-value-pop">
            {display.toLocaleString("vi-VN")}
          </span>
        </p>
      ) : (
        // A non-numeric fallback (e.g. "Chưa có dữ liệu") at the same 3xl size used for counts
        // wraps to two or three lines in a tile this narrow, stretching every sibling tile in the
        // grid row up to match -- the numeric tiles next to it end up with a lot of dead space.
        <p className="relative mt-4 text-sm font-bold leading-snug text-slate-600">{value}</p>
      )}

      <p className="relative mt-1 text-xs font-bold text-slate-600">{label}</p>

      {(subtext || trend) && (
        <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {trend && <span className={`text-[11px] font-bold ${trendTones[trend.type]}`}>{trend.value}</span>}
          {subtext && <span className="text-[11px] font-semibold text-slate-500">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
