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
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-left flex flex-col justify-between">
      <div className="mb-4">
        <h4 className="text-xs font-black uppercase tracking-wider text-gray-500">{title}</h4>
      </div>
      <div className="w-full h-64 text-[10px] font-bold">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f5" />
            <XAxis dataKey={xAxisKey} stroke="#8a8b9e" strokeWidth={1} tickLine={false} />
            <YAxis stroke="#8a8b9e" strokeWidth={1} tickLine={false} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                border: '1px solid #e3e1eb', 
                borderRadius: '12px', 
                fontSize: '11px',
                fontWeight: 'bold',
                fontFamily: 'sans-serif'
              }} 
            />
            <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
            {dataKeys.map((item, idx) => (
              <Line
                key={idx}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeWidth={2.5}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
