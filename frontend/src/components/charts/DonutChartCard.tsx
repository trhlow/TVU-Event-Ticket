import React from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import SectionCard from "../common/SectionCard";

interface DonutChartCardProps {
  title: string;
  data: { name: string; value: number }[];
  colors: string[];
}

export default function DonutChartCard({
  title,
  data,
  colors,
}: DonutChartCardProps) {
  // Recharts renders an empty circle with no slices when every value is 0 (a club with no
  // registrations yet, a fresh dashboard) -- it never draws a "no data" fallback of its own. Left
  // alone, that reads as a broken layout: a tall blank box above the legend instead of a chart.
  const hasData = data.some((entry) => entry.value > 0);

  return (
    <SectionCard title={title} description="Tỷ trọng trạng thái hiện tại" className="hover-lift text-left">
      {hasData ? (
        <div className="relative flex h-60 w-full items-center justify-center text-[10px] font-medium">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors[index % colors.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #bfdbfe",
                  // Recharts tooltips are inline JS styles and cannot read the Tailwind
                  // token, so --radius-card's 16px is duplicated here by hand.
                  borderRadius: "16px",
                  boxShadow: "0 14px 30px rgba(15, 23, 42, 0.1)",
                  fontSize: "12px",
                  fontWeight: "600",
                  fontFamily: "sans-serif",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "600" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-60 w-full flex-col items-center justify-center gap-2 text-center">
          <PieChartIcon className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-xs font-semibold text-slate-400">Chưa có dữ liệu để hiển thị</p>
        </div>
      )}
    </SectionCard>
  );
}
