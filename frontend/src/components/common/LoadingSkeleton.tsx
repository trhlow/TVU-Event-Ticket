import React from 'react';

interface LoadingSkeletonProps {
  type?: 'card' | 'table' | 'list' | 'banner';
  count?: number;
}

export default function LoadingSkeleton({ type = 'card', count = 3 }: LoadingSkeletonProps) {
  const renderItems = () => {
    const items = [];
    for (let i = 0; i < count; i++) {
      if (type === 'card') {
        items.push(
          <div key={i} className="enterprise-card animate-pulse space-y-4 p-5">
            <div className="flex justify-between items-start">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-8 bg-gray-200 rounded w-2/3"></div>
            <div className="pt-3 border-t border-gray-50 flex justify-between">
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/5"></div>
            </div>
          </div>
        );
      } else if (type === 'table') {
        items.push(
          <tr key={i} className="animate-pulse border-b border-gray-100">
            <td className="p-4"><div className="h-4 bg-gray-200 rounded w-1/2"></div></td>
            <td className="p-4"><div className="h-4 bg-gray-200 rounded w-3/4"></div></td>
            <td className="p-4"><div className="h-4 bg-gray-200 rounded w-2/3"></div></td>
            <td className="p-4"><div className="h-4 bg-gray-200 rounded w-1/3"></div></td>
            <td className="p-4 text-center"><div className="h-6 bg-gray-200 rounded-full w-16 mx-auto"></div></td>
          </tr>
        );
      } else {
        items.push(
          <div key={i} className="enterprise-card flex animate-pulse items-center gap-4 p-4">
            <div className="w-12 h-12 bg-gray-200 rounded-2xl"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        );
      }
    }
    return items;
  };

  if (type === 'banner') {
    return <div className="h-full w-full animate-pulse bg-gradient-to-r from-slate-100 via-brand-50 to-slate-100" />;
  }

  if (type === 'table') {
    return (
      <div className="enterprise-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-4 h-10 w-1/4"></th>
              <th className="p-4 h-10 w-1/4"></th>
              <th className="p-4 h-10 w-1/4"></th>
              <th className="p-4 h-10 w-1/8"></th>
              <th className="p-4 h-10 w-1/8"></th>
            </tr>
          </thead>
          <tbody>{renderItems()}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={type === 'card' ? "grid grid-cols-1 md:grid-cols-3 gap-6" : "space-y-4"}>
      {renderItems()}
    </div>
  );
}
