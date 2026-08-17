import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import SectionCard from "../common/SectionCard";

interface LineChartCardProps {
  title: string;
  data: any[];
  dataKeys: { key: string; name: string; color: string }[];
  xAxisKey: string;
}

export default function LineChartCard({
  title,
  data,
  dataKeys,
  xAxisKey,
}: LineChartCardProps) {
  return (
    <SectionCard
      title={title}
      description="Theo dõi xu hướng vận hành theo thời gian"
      className="h-full hover-lift text-left"
    >
      <div className="h-full min-h-60 w-full text-[10px] font-medium">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
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
              <Line
                key={idx}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeWidth={3}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
