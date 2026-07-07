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
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-left flex flex-col justify-between">
      <div className="mb-4">
        <h4 className="text-xs font-black uppercase tracking-wider text-gray-500">
          {title}
        </h4>
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
                border: "1px solid #e3e1eb",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: "bold",
                fontFamily: "sans-serif",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
