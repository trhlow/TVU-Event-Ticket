import { mockUsers } from "../data/mockUsers";
import { User } from "../types/user";
import { apiConfig, apiRequest, createUnsupportedApiError } from "./apiClient";

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

async function withUserFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  // Demo mode is the only sanctioned source of mock data; a failed real request always throws
  // so the UI shows a genuine error state instead of silently masking it with fixture data.
  if (apiConfig.useDemoData) return fallback();
  return request();
}

export const userService = {
  list(): User[] {
    if (!apiConfig.useDemoData) throw createUnsupportedApiError("danh sach tat ca nguoi dung");
    return mockUsers;
  },
  async listOrganizersRemote(): Promise<User[]> {
    return withUserFallback(
      async () => (await apiRequest<OrganizerResponse[]>("/admin/organizers")).map(mapOrganizer),
      () => mockUsers.filter((user) => user.role === "ORGANIZER"),
    );
  },
  listOrganizers(): User[] {
    return mockUsers.filter((user) => user.role === "ORGANIZER");
  },
  listStudents(): User[] {
    if (!apiConfig.useDemoData) throw createUnsupportedApiError("quan ly sinh vien");
    return mockUsers.filter((user) => user.role === "SINH_VIEN");
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
