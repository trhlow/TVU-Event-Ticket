import React from "react";
import { FlaskConical } from "lucide-react";

export default function DemoDataBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-800">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Dữ liệu demo
    </span>
  );
}
