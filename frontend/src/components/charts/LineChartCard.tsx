import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

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
    <div className="enterprise-card hover-lift flex flex-col justify-between p-5 text-left">
      <div className="mb-4">
        <h4 className="font-display text-base font-extrabold text-slate-950">{title}</h4>
        <p className="mt-1 text-xs font-semibold text-slate-500">Theo dõi xu hướng vận hành theo thời gian</p>
      </div>
      <div className="w-full h-64 text-[10px] font-bold">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey={xAxisKey} stroke="#6b7280" strokeWidth={1} tickLine={false} />
            <YAxis stroke="#6b7280" strokeWidth={1} tickLine={false} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                border: '1px solid #e5e7eb',
                borderRadius: '14px',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'sans-serif'
              }} 
            />
            <Legend wrapperStyle={{ fontSize: '12px', fontWeight: '700' }} />
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
    </div>
  );
}
