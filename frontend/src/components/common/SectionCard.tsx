import React from "react";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Titled panel used for every content block inside a page: heading on the left,
 * optional action on the right, body beneath. Before this existed the same
 * markup was hand-written in 31 files, which is how four different corner radii
 * and three different heading sizes ended up in the app.
 */
export default function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  bodyClassName,
  children,
}: SectionCardProps) {
  return (
    <Card className={cn("flex flex-col p-section", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-extrabold tracking-tight text-slate-950">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className={cn("mt-4 min-w-0 flex-1", bodyClassName)}>{children}</div>
    </Card>
  );
}
