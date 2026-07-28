import { User } from "../types/user";
import { apiRequest } from "./apiClient";

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

export const userService = {
  async listOrganizersRemote(): Promise<User[]> {
    return (await apiRequest<OrganizerResponse[]>("/admin/organizers")).map(mapOrganizer);
  },
  async listAllRemote(params?: { role?: User["role"]; mssvStatus?: User["mssvStatus"] }): Promise<User[]> {
    const query = new URLSearchParams();
    if (params?.role) query.set("role", params.role);
    if (params?.mssvStatus) query.set("mssvStatus", params.mssvStatus);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return (await apiRequest<AdminUserResponse[]>(`/admin/users${suffix}`)).map(mapAdminUser);
  },
  async verifyMssv(userId: string): Promise<void> {
    return apiRequest<void>(`/admin/users/${userId}/verify-mssv`, { method: "PATCH" });
  },
  async createOrganizer(data: CreateOrganizerRequest): Promise<User> {
    return mapOrganizer(await apiRequest<OrganizerResponse>("/admin/organizers", {
      method: "POST",
      body: JSON.stringify(data),
    }));
  },
  async lockOrganizer(organizerId: string): Promise<User> {
    return mapOrganizer(await apiRequest<OrganizerResponse>(`/admin/organizers/${organizerId}/lock`, { method: "PATCH" }));
  },
  async deleteOrganizer(organizerId: string): Promise<void> {
    return apiRequest<void>(`/admin/organizers/${organizerId}`, { method: "DELETE" });
  },
};
