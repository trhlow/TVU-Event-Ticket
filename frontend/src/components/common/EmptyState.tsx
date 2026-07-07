import React from 'react';
import { Inbox, LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="enterprise-card mx-auto flex max-w-lg flex-col items-center justify-center p-8 text-center md:p-12">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-brand-100 bg-brand-50 text-brand-700 shadow-sm">
        <Icon className="h-7 w-7" />
      </div>
      <h4 className="font-display text-lg font-extrabold tracking-tight text-gray-950">{title}</h4>
      <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-gray-500">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="btn-press mt-5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
