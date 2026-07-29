import { Club } from "../types/club";
import { apiRequest } from "./apiClient";

interface ClubResponse {
  id: string;
  name: string;
  description?: string | null;
  status: Club["status"];
  createdAt: string;
}

interface ClubRequest {
  name: string;
  description?: string;
}

function mapClub(response: ClubResponse): Club {
  return {
    id: response.id,
    name: response.name,
    code: response.name.slice(0, 8).toUpperCase(),
    description: response.description || "",
    status: response.status,
    createdAt: response.createdAt,
  };
}

export const clubService = {
  async listRemote(): Promise<Club[]> {
    return (await apiRequest<ClubResponse[]>("/admin/clubs")).map(mapClub);
  },
  async getByIdRemote(clubId: string): Promise<Club | undefined> {
    const clubs = await this.listRemote();
    return clubs.find((club) => club.id === clubId);
  },
  async create(data: ClubRequest): Promise<Club> {
    return mapClub(await apiRequest<ClubResponse>("/admin/clubs", {
      method: "POST",
      body: JSON.stringify(data),
    }));
  },
  async update(clubId: string, data: ClubRequest): Promise<Club> {
    return mapClub(await apiRequest<ClubResponse>(`/admin/clubs/${clubId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }));
  },
  async deactivate(clubId: string): Promise<void> {
    return apiRequest<void>(`/admin/clubs/${clubId}`, { method: "DELETE" });
  },
};
