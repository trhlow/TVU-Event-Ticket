import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-500 font-bold mb-4">
      <Link to="/" className="hover:text-brand-700 flex items-center gap-1">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          {item.path ? (
            <Link to={item.path} className="hover:text-brand-700">
              {item.label}
            </Link>
          ) : (
            <span className="text-brand-700 font-extrabold">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
