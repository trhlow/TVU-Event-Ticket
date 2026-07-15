import React from "react";
import { LucideIcon } from "lucide-react";
import Breadcrumb from "./Breadcrumb";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface PageHeaderProps {
  breadcrumb?: BreadcrumbItem[];
  eyebrow?: string;
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Standard page-level heading used across Student/Organizer/Super Admin routes:
 * breadcrumb → eyebrow → title + description → primary actions, with an optional slot
 * (`children`) for filters/summary chips directly beneath. Kept deliberately unopinionated
 * about background (no card wrapper) so it composes into `page-hero` or a plain surface.
 */
export default function PageHeader({ breadcrumb, eyebrow, icon: Icon, title, description, actions, children }: PageHeaderProps) {
  return (
    <div className="space-y-4">
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && (
            <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {eyebrow}
            </p>
          )}
          <h1 className="tvu-page-title text-2xl leading-tight sm:text-[1.65rem]">{title}</h1>
          {description && <p className="max-w-2xl text-sm font-medium leading-6 text-slate-500">{description}</p>}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  );
}
