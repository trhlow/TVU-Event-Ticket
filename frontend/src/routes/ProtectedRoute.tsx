import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getCurrentUser, isAuthenticated } from '../data/mockAuth';

interface ProtectedRouteProps {
  allowedRoles?: ('SINH_VIEN' | 'ORGANIZER' | 'SUPER_ADMIN')[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const currentUser = getCurrentUser();

  // If no user is logged in
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // If route is restricted by role and user is not allowed
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/403" replace />;
  }

  // Render child layout/page
  return <Outlet />;
}
