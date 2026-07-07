import React from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-brand-800 to-brand-600 text-white hover:from-brand-700 hover:to-brand-500 border-brand-700 shadow-brand-700/18',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 border-brand-100',
  outline: 'bg-white text-slate-800 hover:bg-slate-50 border-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600 shadow-rose-700/16',
  ghost: 'bg-transparent text-slate-600 hover:bg-white/80 hover:text-brand-800 border-transparent',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'btn-press inline-flex items-center justify-center gap-2 rounded-xl border font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
