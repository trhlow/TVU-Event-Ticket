import React from "react";
import { AlertTriangle } from "lucide-react";

interface ProductionSafetyBannerProps {
  warnings: string[];
}

export default function ProductionSafetyBanner({ warnings }: ProductionSafetyBannerProps) {
  if (warnings.length === 0) return null;

  return (
    <div role="alert" className="sticky top-0 z-[100] space-y-1 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-amber-950">
      {warnings.map((warning, index) => (
        <p key={index} className="flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ))}
    </div>
  );
}
