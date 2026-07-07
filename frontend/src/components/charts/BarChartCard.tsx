import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface BarChartCardProps {
  title: string;
  data: any[];
  dataKeys: { key: string; name: string; color: string }[];
  xAxisKey: string;
}

export default function BarChartCard({
  title,
  data,
  dataKeys,
  xAxisKey,
}: BarChartCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-left flex flex-col justify-between">
      <div className="mb-4">
        <h4 className="text-xs font-black uppercase tracking-wider text-gray-500">
          {title}
        </h4>
      </div>
      <div className="w-full h-64 text-[10px] font-bold">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f1f3f5"
            />
            <XAxis
              dataKey={xAxisKey}
              stroke="#8a8b9e"
              strokeWidth={1}
              tickLine={false}
            />
            <YAxis
              stroke="#8a8b9e"
              strokeWidth={1}
              tickLine={false}
            />
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
            {dataKeys.map((item, idx) => (
              <Bar
                key={idx}
                dataKey={item.key}
                name={item.name}
                fill={item.color}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
