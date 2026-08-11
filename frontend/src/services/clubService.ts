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

// Backend has no dedicated club-code field (ClubResponse carries no `code`). Deriving one from the
// name broke on Vietnamese diacritics/whitespace and collided whenever two clubs shared a prefix.
// Fall back to a stable id-derived tag instead — it's still a client-side placeholder, but at least
// unique and unaffected by renames.
function deriveClubCode(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() || "CLB";
}

function mapClub(response: ClubResponse): Club {
  return {
    id: response.id,
    name: response.name,
    code: deriveClubCode(response.id),
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
  async reactivate(clubId: string): Promise<Club> {
    return mapClub(await apiRequest<ClubResponse>(`/admin/clubs/${clubId}/activate`, { method: "PATCH" }));
  },
};
