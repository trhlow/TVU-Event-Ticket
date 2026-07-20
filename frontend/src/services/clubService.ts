import { mockClubs } from "../data/mockClubs";
import { Club } from "../types/club";
import { apiConfig, apiRequest } from "./apiClient";

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

async function withClubFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  // Demo mode is the only sanctioned source of mock data; a failed real request always throws
  // so the UI shows a genuine error state instead of silently masking it with fixture data.
  if (apiConfig.useDemoData) return fallback();
  return request();
}

export const clubService = {
  async listRemote(): Promise<Club[]> {
    return withClubFallback(
      async () => (await apiRequest<ClubResponse[]>("/admin/clubs")).map(mapClub),
      () => mockClubs,
    );
  },
  list(): Club[] {
    return mockClubs;
  },
  async getByIdRemote(clubId: string): Promise<Club | undefined> {
    const clubs = await this.listRemote();
    return clubs.find((club) => club.id === clubId);
  },
  getById(clubId: string): Club | undefined {
    return mockClubs.find((club) => club.id === clubId);
  },
  async create(data: ClubRequest): Promise<Club> {
    return withClubFallback(
      async () => mapClub(await apiRequest<ClubResponse>("/admin/clubs", {
        method: "POST",
        body: JSON.stringify(data),
      })),
      () => ({
        id: `club_${Date.now()}`,
        name: data.name,
        code: data.name.slice(0, 8).toUpperCase(),
        description: data.description || "",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      }),
    );
  },
  async update(clubId: string, data: ClubRequest): Promise<Club> {
    return withClubFallback(
      async () => mapClub(await apiRequest<ClubResponse>(`/admin/clubs/${clubId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      })),
      () => {
        const existing = mockClubs.find((club) => club.id === clubId);
        return { ...(existing || mockClubs[0]), ...data, id: clubId };
      },
    );
  },
  async deactivate(clubId: string): Promise<void> {
    return withClubFallback(
      () => apiRequest<void>(`/admin/clubs/${clubId}`, { method: "DELETE" }),
      () => undefined,
    );
  },
};
