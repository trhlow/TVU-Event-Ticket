import { getCurrentUser, setCurrentUser } from "../data/mockAuth";
import { User } from "../types/user";
import { apiRequest } from "./apiClient";

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

function persistProfile(profile: AuthProfileResponse): User {
  const user = mapProfileToUser(profile);
  setCurrentUser(user);
  return user;
}

function microsoftConfig() {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
  const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID as string | undefined;
  const redirectUri = (import.meta.env.VITE_MICROSOFT_REDIRECT_URI as string | undefined) || window.location.origin;

  if (!clientId || !tenantId) {
    throw new Error("Frontend chưa cấu hình Microsoft OAuth. Thiết lập VITE_MICROSOFT_CLIENT_ID và VITE_MICROSOFT_TENANT_ID.");
  }

  return { clientId, tenantId, redirectUri };
}

async function loginWithCredential(payload: LoginRequest): Promise<User> {
  await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return persistProfile(await apiRequest<AuthProfileResponse>("/auth/me"));
}

export const authService = {
  getCurrentUser,
  async me(): Promise<User | null> {
    return persistProfile(await apiRequest<AuthProfileResponse>("/auth/me"));
  },
  async loginWithMicrosoft(): Promise<User> {
    const { PublicClientApplication } = await import("@azure/msal-browser");
    const config = microsoftConfig();
    const msal = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: config.redirectUri,
      },
      cache: {
        cacheLocation: "memoryStorage",
      },
    });

    await msal.initialize();
    const response = await msal.loginPopup({
      scopes: ["openid", "profile", "email"],
      prompt: "select_account",
    });

    if (!response.idToken) {
      throw new Error("Microsoft không trả về ID token hợp lệ.");
    }

    return loginWithCredential({
      credential: response.idToken,
      displayName: response.account?.name || response.account?.username,
    });
  },
  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await apiRequest<LoginResponse>("/auth/me/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return persistProfile(response.profile);
  },
  async logout(): Promise<void> {
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
    } finally {
      setCurrentUser(null);
    }
  },
};
