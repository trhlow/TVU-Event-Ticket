export interface AuditLog {
  id: string;
  actorName: string;
  actorRole: 'SINH_VIEN' | 'ORGANIZER' | 'SUPER_ADMIN';
  userName?: string; // Compatibility alias
  role?: 'SINH_VIEN' | 'ORGANIZER' | 'SUPER_ADMIN'; // Compatibility alias
  clubName?: string;
  action: string;
  target: string;
  result: string;
  ipAddress: string;
  createdAt: string;
}
export type Role = 'SINH_VIEN' | 'ORGANIZER' | 'SUPER_ADMIN';
