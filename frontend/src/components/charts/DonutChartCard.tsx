import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

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
  return (
    <div className="enterprise-card hover-lift flex flex-col justify-between p-5 text-left">
      <div className="mb-4">
        <h4 className="font-display text-base font-extrabold text-slate-950">
          {title}
        </h4>
        <p className="mt-1 text-xs font-semibold text-slate-500">Tỷ trọng trạng thái hiện tại</p>
      </div>
      <div className="w-full h-64 text-[10px] font-bold relative flex items-center justify-center">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
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
                border: "1px solid #e5e7eb",
                borderRadius: "14px",
                fontSize: "12px",
                fontWeight: "bold",
                fontFamily: "sans-serif",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", fontWeight: "700" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
