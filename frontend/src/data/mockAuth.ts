import { User } from '../types/user';
import { mockUsers } from './mockUsers';

export const mockAuthAccounts: Record<string, User> = {
  SINH_VIEN: mockUsers.find(u => u.role === 'SINH_VIEN' && u.profileComplete && u.status === 'ACTIVE') || mockUsers[4],
  ORGANIZER: mockUsers.find(u => u.role === 'ORGANIZER') || mockUsers[1],
  SUPER_ADMIN: mockUsers.find(u => u.role === 'SUPER_ADMIN') || mockUsers[0],
};

let currentUser: User = mockAuthAccounts.SUPER_ADMIN;
let authenticated = true;

export function getCurrentUser(): User {
  return currentUser;
}

export function isAuthenticated(): boolean {
  return authenticated;
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    currentUser = user;
    authenticated = true;
    return;
  }

  authenticated = false;
}
