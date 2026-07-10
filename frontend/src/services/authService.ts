import { mockAuthAccounts, getCurrentUser, setCurrentUser } from '../data/mockAuth';
import { User } from '../types/user';
import { apiConfig, apiRequest } from './apiClient';

interface LoginRequest {
  credential: string;
  displayName?: string;
}

interface AuthProfileResponse {
  id: string;
  email: string;
  displayName: string;
  role: User['role'];
  clubId?: string | null;
  mssv?: string | null;
  classCode?: string | null;
  profileComplete: boolean;
}

interface LoginResponse {
  profile: AuthProfileResponse;
}

const MICROSOFT_DEV_CREDENTIAL = import.meta.env.VITE_MICROSOFT_DEV_CREDENTIAL || 'student@tvu.edu.vn';

function mapProfileToUser(profile: AuthProfileResponse): User {
  return {
    id: profile.id,
    fullName: profile.displayName,
    email: profile.email,
    role: profile.role,
    clubId: profile.clubId || undefined,
    mssv: profile.mssv || undefined,
    className: profile.classCode || undefined,
    profileComplete: profile.profileComplete,
    status: 'ACTIVE',
  };
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]?.trim();
  if (!localPart) return email;
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
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
        const profile = await apiRequest<AuthProfileResponse>('/auth/me');
        const user = mapProfileToUser(profile);
        setCurrentUser(user);
        return user;
      },
      () => getCurrentUser(),
    );
  },
  async loginWithMicrosoft(): Promise<User> {
    return withAuthFallback(
      async () => {
        const response = await apiRequest<LoginResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            credential: MICROSOFT_DEV_CREDENTIAL,
            displayName: 'Sinh viên TVU',
          }),
        });
        const user = mapProfileToUser(response.profile);
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
    void password;
    const credential = email.trim().toLowerCase();
    const payload: LoginRequest = {
      credential,
      displayName: displayNameFromEmail(credential),
    };

    return withAuthFallback(
      async () => {
        const response = await apiRequest<LoginResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const user = mapProfileToUser(response.profile);
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
