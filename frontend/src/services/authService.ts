import { mockAuthAccounts, getCurrentUser, setCurrentUser } from '../data/mockAuth';
import { User } from '../types/user';

export const authService = {
  getCurrentUser,
  loginWithMicrosoft(): User {
    const user = mockAuthAccounts.SINH_VIEN;
    setCurrentUser(user);
    return user;
  },
  loginInternal(email: string): User {
    const normalized = email.toLowerCase();
    const user = normalized.includes('admin')
      ? mockAuthAccounts.SUPER_ADMIN
      : mockAuthAccounts.ORGANIZER;
    setCurrentUser(user);
    return user;
  },
  logout(): void {
    setCurrentUser(null);
  },
};
