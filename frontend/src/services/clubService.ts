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
      () => {
        const id = `club_${Date.now()}`;
        return {
          id,
          name: data.name,
          code: deriveClubCode(id),
          description: data.description || "",
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        };
      },
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
