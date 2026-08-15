import { getCurrentUser, setCurrentUser } from "../state/authSession";
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
  clubName?: string | null;
  mssv?: string | null;
  classCode?: string | null;
  mssvStatus?: "UNVERIFIED" | "VERIFIED" | null;
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
    clubName: profile.clubName || undefined,
    mssv: profile.mssv || undefined,
    className: profile.classCode || undefined,
    mssvStatus: profile.mssvStatus || undefined,
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

/**
 * Where the sign-in popup is allowed to land: a blank page served from the same origin, never the
 * application root. See the note at the loginPopup call for what pointing it at the root cost.
 *
 * Exported for the test that pins this behaviour, since the failure it prevents is invisible until a
 * real popup runs against a real Entra tenant.
 */
export function popupRedirectUri(configuredRedirectUri: string): string {
  return new URL("auth-redirect.html", configuredRedirectUri).toString();
}

async function loginWithCredential(payload: LoginRequest): Promise<User> {
  // The third argument turns off retry-after-refresh. A failed sign-in must not trigger a session
  // refresh and a second attempt: there is no session to refresh yet, and retrying doubles every
  // wrong-credential attempt against the rate limit and the audit log.
  await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  }, false);
  return persistProfile(await apiRequest<AuthProfileResponse>("/auth/me"));
}

export const authService = {
  getCurrentUser,
  async me(): Promise<User | null> {
    return persistProfile(await apiRequest<AuthProfileResponse>("/auth/me"));
  },
  /**
   * Dev-only login path. Calls the exact same POST /auth/login + GET /auth/me endpoints as
   * loginWithMicrosoft, matching backend's DevStubIdentityProvider contract (any string
   * containing "@", no password). Callers must gate this behind VITE_AUTH_PROVIDER=devstub and
   * a non-production build so it never reaches real users.
   */
  async loginWithDevStub(credential: string, displayName?: string): Promise<User> {
    return loginWithCredential({ credential: credential.trim(), displayName: displayName?.trim() || undefined });
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
      // The popup lands on a blank page, never on the application root. Pointing it at the root made
      // the popup load the whole React app, which does not initialise MSAL -- it imports the library
      // only when this function runs -- so nothing in the popup ever claimed the code or answered the
      // window that opened it, and this call died with MSAL's `timed_out` while the popup sat on the
      // home page with the code still in its address bar. Confirmed against the deployed site with a
      // guest and a member account, in Incognito and in a second browser.
      //
      // Per-request rather than on the instance: VITE_MICROSOFT_REDIRECT_URI stays the application
      // root, which is what the frontend config fingerprint is computed over and what preflight
      // compares against .env. Both URIs must be registered in Entra as Single-page application.
      redirectUri: popupRedirectUri(config.redirectUri),
    });

    if (!response.idToken) {
      throw new Error("Microsoft không trả về ID token hợp lệ.");
    }

    return loginWithCredential({
      credential: response.idToken,
      displayName: response.account?.name || response.account?.username,
    });
  },
  /**
   * Admin sign-in step one: ask for a code. Always resolves — the backend answers 202 whether or not the
   * address belongs to an admin, so the UI cannot be used to discover which addresses are privileged.
   */
  async requestOtp(email: string): Promise<void> {
    await apiRequest<void>("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ email: email.trim() }),
    });
  },
  async verifyOtp(email: string, code: string, rememberDevice: boolean): Promise<User> {
    await apiRequest<LoginResponse>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), code: code.trim(), rememberDevice }),
    });
    return persistProfile(await apiRequest<AuthProfileResponse>("/auth/me"));
  },
  async refreshSession(): Promise<User> {
    await apiRequest<LoginResponse>("/auth/session/refresh", { method: "POST" });
    return persistProfile(await apiRequest<AuthProfileResponse>("/auth/me"));
  },
  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await apiRequest<LoginResponse>("/auth/me/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return persistProfile(response.profile);
  },
  async updateDisplayName(displayName: string): Promise<User> {
    const response = await apiRequest<LoginResponse>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
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
