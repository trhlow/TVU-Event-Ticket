import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-semibold shadow-sm transition disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-brand-600 bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 text-white shadow-brand-700/18 hover:from-brand-600 hover:to-accent-500",
        secondary: "border-blue-100 bg-blue-50 text-brand-800 hover:bg-blue-100",
        outline: "border-blue-100 bg-white text-slate-800 hover:bg-blue-50",
        ghost: "border-transparent bg-transparent text-slate-600 hover:bg-white/90 hover:text-brand-800",
        destructive: "border-rose-600 bg-rose-600 text-white shadow-rose-700/16 hover:bg-rose-700",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-5",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button };
