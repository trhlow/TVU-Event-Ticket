import { mockAuthAccounts, getCurrentUser, setCurrentUser } from '../data/mockAuth';
import { User } from '../types/user';
import { apiConfig, apiRequest } from './apiClient';

interface LoginRequest {
  email: string;
  password: string;
}

async function withAuthFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!apiConfig.enableMockFallback) throw error;
    return fallback();
  }
}

export const authService = {
  getCurrentUser,
  async me(): Promise<User | null> {
    return withAuthFallback(
      async () => {
        const user = await apiRequest<User>('/auth/me');
        setCurrentUser(user);
        return user;
      },
      () => getCurrentUser(),
    );
  },
  async loginWithMicrosoft(): Promise<User> {
    return withAuthFallback(
      async () => {
        const user = await apiRequest<User>('/auth/microsoft', { method: 'POST' });
        setCurrentUser(user);
        return user;
      },
      () => {
        const user = mockAuthAccounts.SINH_VIEN;
        setCurrentUser(user);
        return user;
      },
    );
  },
  async loginInternal(email: string, password: string): Promise<User> {
    const payload: LoginRequest = { email, password };

    return withAuthFallback(
      async () => {
        const user = await apiRequest<User>('/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setCurrentUser(user);
        return user;
      },
      () => {
        const normalized = email.toLowerCase();
        const user = normalized.includes('admin') ? mockAuthAccounts.SUPER_ADMIN : mockAuthAccounts.ORGANIZER;
        setCurrentUser(user);
        return user;
      },
    );
  },
  async logout(): Promise<void> {
    await withAuthFallback(
      () => apiRequest<void>('/auth/logout', { method: 'POST' }),
      () => undefined,
    );
    setCurrentUser(null);
  },
};
