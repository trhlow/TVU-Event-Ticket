import { mockUsers } from "../data/mockUsers";
import { User } from "../types/user";
import { apiConfig, apiRequest } from "./apiClient";

interface OrganizerResponse {
  id: string;
  email: string;
  displayName: string;
  role: User["role"];
  clubId?: string | null;
  status: User["status"];
}

interface CreateOrganizerRequest {
  email: string;
  displayName: string;
  clubId: string;
}

interface AdminUserResponse {
  id: string;
  email: string;
  displayName: string;
  role: User["role"];
  clubId?: string | null;
  mssv?: string | null;
  classCode?: string | null;
  mssvStatus?: User["mssvStatus"];
  status: User["status"];
}

function mapOrganizer(response: OrganizerResponse): User {
  return {
    id: response.id,
    fullName: response.displayName,
    email: response.email,
    role: response.role,
    clubId: response.clubId || undefined,
    profileComplete: true,
    status: response.status,
  };
}

function mapAdminUser(response: AdminUserResponse): User {
  return {
    id: response.id,
    fullName: response.displayName,
    email: response.email,
    role: response.role,
    clubId: response.clubId || undefined,
    mssv: response.mssv || undefined,
    className: response.classCode || undefined,
    mssvStatus: response.mssvStatus,
    profileComplete: !!(response.mssv && response.mssv.trim()),
    status: response.status,
  };
}

async function withUserFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  // Demo mode is the only sanctioned source of mock data; a failed real request always throws
  // so the UI shows a genuine error state instead of silently masking it with fixture data.
  if (apiConfig.useDemoData) return fallback();
  return request();
}

export const userService = {
  async listOrganizersRemote(): Promise<User[]> {
    return withUserFallback(
      async () => (await apiRequest<OrganizerResponse[]>("/admin/organizers")).map(mapOrganizer),
      () => mockUsers.filter((user) => user.role === "ORGANIZER"),
    );
  },
  listOrganizers(): User[] {
    return mockUsers.filter((user) => user.role === "ORGANIZER");
  },
  async listAllRemote(params?: { role?: User["role"]; mssvStatus?: User["mssvStatus"] }): Promise<User[]> {
    const query = new URLSearchParams();
    if (params?.role) query.set("role", params.role);
    if (params?.mssvStatus) query.set("mssvStatus", params.mssvStatus);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return withUserFallback(
      async () => (await apiRequest<AdminUserResponse[]>(`/admin/users${suffix}`)).map(mapAdminUser),
      () => mockUsers.filter((user) => !params?.role || user.role === params.role),
    );
  },
  async verifyMssv(userId: string): Promise<void> {
    return withUserFallback(
      () => apiRequest<void>(`/admin/users/${userId}/verify-mssv`, { method: "PATCH" }),
      () => undefined,
    );
  },
  async createOrganizer(data: CreateOrganizerRequest): Promise<User> {
    return withUserFallback(
      async () => mapOrganizer(await apiRequest<OrganizerResponse>("/admin/organizers", {
        method: "POST",
        body: JSON.stringify(data),
      })),
      () => ({
        id: `user_org_${Date.now()}`,
        fullName: data.displayName,
        email: data.email,
        role: "ORGANIZER",
        clubId: data.clubId,
        profileComplete: true,
        status: "ACTIVE",
      }),
    );
  },
  async lockOrganizer(organizerId: string): Promise<User> {
    return withUserFallback(
      async () => mapOrganizer(await apiRequest<OrganizerResponse>(`/admin/organizers/${organizerId}/lock`, { method: "PATCH" })),
      () => {
        const existing = mockUsers.find((user) => user.id === organizerId);
        return { ...(existing || mockUsers[0]), status: "LOCKED" };
      },
    );
  },
  async resetOrganizer(organizerId: string): Promise<User> {
    return withUserFallback(
      async () => mapOrganizer(await apiRequest<OrganizerResponse>(`/admin/organizers/${organizerId}/reset`, { method: "POST" })),
      () => {
        const existing = mockUsers.find((user) => user.id === organizerId);
        return existing || mockUsers[0];
      },
    );
  },
  async deleteOrganizer(organizerId: string): Promise<void> {
    return withUserFallback(
      () => apiRequest<void>(`/admin/organizers/${organizerId}`, { method: "DELETE" }),
      () => undefined,
    );
  },
};
