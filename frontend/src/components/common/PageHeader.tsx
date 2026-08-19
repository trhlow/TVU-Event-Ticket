import React from "react";
import Breadcrumb from "./Breadcrumb";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface PageHeaderProps {
  breadcrumb?: BreadcrumbItem[];
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Standard page-level heading used across Student/Organizer/Super Admin routes:
 * breadcrumb → title + description → primary actions, with an optional slot
 * (`children`) for filters/summary chips directly beneath. Kept deliberately unopinionated
 * about background (no card wrapper) so it sits on any surface.
 */
export default function PageHeader({ breadcrumb, title, description, actions, children }: PageHeaderProps) {
  return (
    <div className="space-y-4">
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="tvu-page-title text-2xl leading-tight sm:text-[1.65rem]">{title}</h1>
          {description && <p className="max-w-2xl text-sm font-medium leading-6 text-slate-500">{description}</p>}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  );
}
