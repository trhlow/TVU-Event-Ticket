import React from "react";
import { CheckCircle2, Clock3, DoorOpen, XCircle } from "lucide-react";
import {
  formatEventStatus,
  formatReservationStatus,
  formatTicketStatus,
  formatUserStatus,
} from "../../utils/formatStatus";
import { Badge } from "../ui/badge";

interface StatusBadgeProps {
  type: "event" | "reservation" | "ticket" | "user";
  status: string;
  checkInStatus?: string;
}

export default function StatusBadge({ type, status, checkInStatus }: StatusBadgeProps) {
  const Icon = (() => {
    if (type === "reservation" && status === "PENDING") return Clock3;
    if (type === "reservation" && status === "REJECTED") return XCircle;
    if (type === "ticket" && checkInStatus === "CHECKED_IN") return DoorOpen;
    if (status === "OPEN" || status === "APPROVED" || status === "VALID" || status === "ACTIVE") return CheckCircle2;
    if (status === "FULL" || status === "EXPIRED" || status === "REJECTED") return XCircle;
    return Clock3;
  })();

  const styles = (() => {
    if (type === "event") {
      if (status === "OPEN") return "bg-emerald-50 text-emerald-700 border-emerald-200";
      if (status === "UPCOMING") return "bg-blue-50 text-brand-700 border-blue-200";
      if (status === "FULL") return "bg-amber-50 text-amber-700 border-amber-200";
      if (status === "ENDED") return "bg-slate-100 text-slate-600 border-slate-200";
      return "bg-slate-50 text-slate-600 border-slate-200";
    }

    if (type === "reservation") {
      if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
      if (status === "APPROVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
      if (status === "REJECTED") return "bg-rose-50 text-rose-700 border-rose-200";
    }

    if (type === "ticket") {
      if (checkInStatus === "CHECKED_IN") return "bg-emerald-50 text-emerald-700 border-emerald-200";
      if (status === "VALID") return "bg-blue-50 text-brand-700 border-blue-200";
      if (status === "EXPIRED") return "bg-amber-50 text-amber-700 border-amber-200";
      return "bg-rose-50 text-rose-700 border-rose-200";
    }

    if (type === "user" && status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  })();

  const label =
    type === "event"
      ? formatEventStatus(status)
      : type === "reservation"
        ? formatReservationStatus(status)
        : type === "ticket"
          ? formatTicketStatus(status, checkInStatus)
          : formatUserStatus(status);

  return (
    <Badge className={`gap-1.5 shadow-sm ${styles}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
