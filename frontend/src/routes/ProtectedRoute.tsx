import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { getCurrentUser, isAuthenticated, setCurrentUser } from "../state/authSession";
import { authService } from "../services/authService";
import { ApiError } from "../services/apiClient";
import { User } from "../types/user";

interface ProtectedRouteProps {
  allowedRoles?: User["role"][];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const [currentUser, setRouteUser] = useState<User | null>(() => getCurrentUser());
  const [isLoadingSession, setIsLoadingSession] = useState(!isAuthenticated());
  const [sessionChecked, setSessionChecked] = useState(isAuthenticated());
  const [connectionError, setConnectionError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const cachedUser = getCurrentUser();
      if (isAuthenticated() && cachedUser) {
        if (mounted) {
          setRouteUser(cachedUser);
          setIsLoadingSession(false);
          setSessionChecked(true);
          setConnectionError(false);
        }
        return;
      }

      try {
        const user = await authService.me();
        if (mounted) {
          setRouteUser(user);
          setConnectionError(false);
        }
      } catch (error) {
        // Status 0 means fetch itself failed (backend unreachable) — not the same as an
        // expired/invalid session (401/403), so it must not be silently treated as "logged out".
        const isNetworkFailure = error instanceof ApiError && error.status === 0;
        if (mounted) {
          if (isNetworkFailure) {
            setConnectionError(true);
          } else {
            setCurrentUser(null);
            setRouteUser(null);
            setConnectionError(false);
          }
        }
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
  }, [retryToken]);

  if (isLoadingSession || !sessionChecked) {
    return (
      <div className="grid min-h-[260px] place-items-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
          Đang kiểm tra phiên đăng nhập...
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="grid min-h-[260px] place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-center shadow-sm">
          <WifiOff className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-extrabold text-rose-800">Không thể kết nối máy chủ</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-rose-700">
            Không thể xác minh phiên đăng nhập vì backend không phản hồi. Đây không phải lỗi đăng nhập — vui lòng kiểm tra kết nối
            hoặc trạng thái backend rồi thử lại.
          </p>
          <button
            type="button"
            onClick={() => {
              setIsLoadingSession(true);
              setSessionChecked(false);
              setRetryToken((value) => value + 1);
            }}
            className="btn-press mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-xs font-extrabold text-white hover:bg-rose-700"
          >
            Thử lại
          </button>
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
