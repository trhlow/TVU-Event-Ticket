import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-chip border px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-info-100 bg-info-50 text-brand-800",
        secondary: "border-slate-200 bg-slate-100 text-slate-700",
        success: "border-success-200 bg-success-50 text-success-700",
        warning: "border-warning-200 bg-warning-50 text-warning-700",
        destructive: "border-danger-200 bg-danger-50 text-danger-700",
        outline: "border-info-100 bg-white text-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
