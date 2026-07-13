import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getCurrentUser, isAuthenticated, setCurrentUser } from "../data/mockAuth";
import { authService } from "../services/authService";
import { User } from "../types/user";

interface ProtectedRouteProps {
  allowedRoles?: User["role"][];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const [currentUser, setRouteUser] = useState<User | null>(() => getCurrentUser());
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated());
  const [sessionChecked, setSessionChecked] = useState(isAuthenticated());

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const cachedUser = getCurrentUser();
      if (isAuthenticated() && cachedUser) {
        if (mounted) {
          setRouteUser(cachedUser);
          setIsLoadingSession(false);
          setSessionChecked(true);
        }
        return;
      }

      try {
        const user = await authService.me();
        if (mounted) setRouteUser(user);
      } catch {
        setCurrentUser(null);
        if (mounted) setRouteUser(null);
      } finally {
        if (mounted) {
          setIsLoadingSession(false);
          setSessionChecked(true);
        }
      }
    }

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoadingSession || !sessionChecked) {
    return (
      <div className="grid min-h-[260px] place-items-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
          Đang kiểm tra phiên đăng nhập...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
