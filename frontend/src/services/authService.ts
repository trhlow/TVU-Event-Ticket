import { mockAuthAccounts, getCurrentUser, setCurrentUser } from "../data/mockAuth";
import { User } from "../types/user";
import { apiConfig, apiRequest, apiUrl } from "./apiClient";

interface LoginRequest {
  credential: string;
  displayName?: string;
}

interface AuthProfileResponse {
  id: string;
  email: string;
  displayName: string;
  role: User["role"];
  clubId?: string | null;
  mssv?: string | null;
  classCode?: string | null;
  profileComplete: boolean;
}

interface LoginResponse {
  profile: AuthProfileResponse;
}

interface UpdateProfileRequest {
  mssv: string;
  classCode: string;
}

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
    status: "ACTIVE",
  };
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return email;
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

async function withAuthFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  if (apiConfig.useDemoData) return fallback();
  try {
    return await request();
  } catch (error) {
    if (!apiConfig.enableMockFallback) throw error;
    return fallback();
  }
}

function persistProfile(profile: AuthProfileResponse): User {
  const user = mapProfileToUser(profile);
  setCurrentUser(user);
  return user;
}

export const authService = {
  getCurrentUser,
  async me(): Promise<User | null> {
    return withAuthFallback(
      async () => persistProfile(await apiRequest<AuthProfileResponse>("/auth/me")),
      () => {
        const user = getCurrentUser();
        setCurrentUser(user);
        return user;
      },
    );
  },
  async loginWithMicrosoft(): Promise<User> {
    window.location.assign(apiUrl("/auth/oauth2/microsoft/authorize"));
    return new Promise<User>(() => undefined);
  },
  async loginWithDevStub(email: string): Promise<User> {
    const credential = email.trim().toLowerCase();
    const payload: LoginRequest = {
      credential,
      displayName: displayNameFromEmail(credential),
    };

    return withAuthFallback(
      async () => {
        const response = await apiRequest<LoginResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return persistProfile(response.profile);
      },
      () => {
        const normalized = email.toLowerCase();
        const user = normalized.includes("admin")
          ? mockAuthAccounts.SUPER_ADMIN
          : normalized.includes("organizer")
            ? mockAuthAccounts.ORGANIZER
            : mockAuthAccounts.SINH_VIEN;
        setCurrentUser(user);
        return user;
      },
    );
  },
  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    return withAuthFallback(
      async () => {
        const response = await apiRequest<LoginResponse>("/auth/me/profile", {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        return persistProfile(response.profile);
      },
      () => {
        const user = { ...getCurrentUser(), mssv: data.mssv, className: data.classCode, profileComplete: true };
        setCurrentUser(user);
        return user;
      },
    );
  },
  async logout(): Promise<void> {
    await withAuthFallback(
      () => apiRequest<void>("/auth/logout", { method: "POST" }),
      () => undefined,
    );
    setCurrentUser(null);
  },
};
