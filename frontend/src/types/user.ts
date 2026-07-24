export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'SINH_VIEN' | 'ORGANIZER' | 'SUPER_ADMIN';
  clubId?: string; // For organizers
  clubName?: string; // For organizers
  phone?: string; // For contact
  mssv?: string; // For students
  className?: string; // For students
  mssvStatus?: 'UNVERIFIED' | 'VERIFIED'; // For students
  profileComplete: boolean;
  status: 'ACTIVE' | 'LOCKED';
}
