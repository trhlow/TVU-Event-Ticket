import { User } from "../types/user";

export function isStudent(user: User | null): boolean {
  return user?.role === "SINH_VIEN";
}

export function isOrganizer(user: User | null): boolean {
  return user?.role === "ORGANIZER";
}

export function isSuperAdmin(user: User | null): boolean {
  return user?.role === "SUPER_ADMIN";
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case "SINH_VIEN":
      return "Sinh viên";
    case "ORGANIZER":
      return "Ban tổ chức CLB";
    case "SUPER_ADMIN":
      return "Super Admin";
    default:
      return role;
  }
}
