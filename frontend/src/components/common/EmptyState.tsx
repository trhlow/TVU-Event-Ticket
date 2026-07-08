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
    <div className="enterprise-card mx-auto flex max-w-md flex-col items-center justify-center p-5 text-center md:p-6">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-700 shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <h4 className="font-display text-base font-semibold tracking-tight text-gray-950">{title}</h4>
      <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-gray-500">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="btn-press mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
