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
import SectionCard from "../common/SectionCard";

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
    <SectionCard title={title} description="So sánh dữ liệu theo nhóm" className="h-full hover-lift text-left">
      <div className="h-full min-h-60 w-full text-[10px] font-medium">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
            <XAxis dataKey={xAxisKey} stroke="#64748b" strokeWidth={1} tickLine={false} />
            <YAxis stroke="#64748b" strokeWidth={1} tickLine={false} />
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
            {dataKeys.map((item, idx) => (
              <Bar
                key={idx}
                dataKey={item.key}
                name={item.name}
                fill={item.color}
                radius={[8, 8, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
