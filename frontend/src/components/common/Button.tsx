import React from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { Button as ShadcnButton } from '../ui/button';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: '',
  secondary: '',
  outline: '',
  danger: '',
  ghost: '',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
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
    <ShadcnButton
      {...props}
      disabled={disabled || loading}
      variant={variant === 'danger' ? 'destructive' : variant === 'primary' ? 'default' : variant}
      size={size === 'md' ? 'default' : size}
      className={clsx(
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </ShadcnButton>
  );
}
