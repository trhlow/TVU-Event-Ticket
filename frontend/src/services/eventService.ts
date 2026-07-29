import { Event } from "../types/event";
import { apiRequest } from "./apiClient";

type BackendEventStatus = "DRAFT" | "OPEN" | "CLOSED";

interface EventResponse {
  id: string;
  clubId: string;
  title: string;
  description: string;
  capacity: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  endAt: string;
  location: string;
  status: BackendEventStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface EventRequest {
  title: string;
  description?: string;
  bannerUrl?: string;
  capacity: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  endAt: string;
  location: string;
}

interface AvailabilityResponse {
  eventId: string;
  totalCapacity: number;
  approvedCount: number;
  remaining: number;
}

type EventPayload = Partial<Event>;

function mapRemoteEvent(event: EventResponse, availability?: AvailabilityResponse, availabilityUnknown = false): Event {
  return {
    id: event.id,
    clubId: event.clubId,
    // EventResponse has no club display-name field (see backend/docs/BACKEND_SECURITY_REQUIREMENTS.md
    // item 15) — leave it empty rather than fabricating a name; callers hide the club line when blank.
    clubName: "",
    title: event.title,
    description: event.description || "",
    bannerUrl: "",
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    registrationOpenAt: event.registrationOpenAt,
    registrationCloseAt: event.registrationCloseAt,
    capacity: availability?.totalCapacity ?? event.capacity,
    remainingTickets: availability?.remaining ?? event.capacity,
    availabilityUnknown: !availability && availabilityUnknown,
    status: event.status,
  };
}

function toEventRequest(data: EventPayload): EventRequest {
  return {
    title: data.title?.trim() || "",
    description: data.description?.trim() || "",
    bannerUrl: data.bannerUrl?.trim() || "",
    capacity: Number(data.capacity || 0),
    registrationOpenAt: toInstant(data.registrationOpenAt),
    registrationCloseAt: toInstant(data.registrationCloseAt),
    startAt: toInstant(data.startAt),
    endAt: toInstant(data.endAt),
    location: data.location?.trim() || "",
  };
}

function toInstant(value?: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

async function loadAvailability(eventIds: string[]): Promise<{ data: Map<string, AvailabilityResponse>; failed: boolean }> {
  if (eventIds.length === 0) return { data: new Map(), failed: false };
  try {
    const params = encodeURIComponent(eventIds.slice(0, 100).join(","));
    const response = await apiRequest<Record<string, AvailabilityResponse>>(`/ticketing/events/availability?ids=${params}`);
    return { data: new Map(Object.entries(response)), failed: false };
  } catch {
    // Surface the failure so callers can mark remainingTickets as unverified instead of
    // silently presenting the fallback (event.capacity) as if it were the real vé count.
    return { data: new Map(), failed: true };
  }
}

export const eventService = {
  async listRemote(): Promise<Event[]> {
    return this.getPublicEvents();
  },
  async getPublicEvents(): Promise<Event[]> {
    const events = await apiRequest<EventResponse[]>("/events");
    const availability = await loadAvailability(events.map((event) => event.id));
    return events.map((event) => mapRemoteEvent(event, availability.data.get(event.id), availability.failed));
  },
  async getFeaturedEvents(limit = 6): Promise<Event[]> {
    return (await this.getPublicEvents()).filter((event) => event.status === "OPEN").slice(0, limit);
  },
  async listByClubRemote(clubId: string): Promise<Event[]> {
    void clubId;
    const events = await apiRequest<EventResponse[]>("/events/mine");
    const availability = await loadAvailability(events.map((event) => event.id));
    return events.map((event) => mapRemoteEvent(event, availability.data.get(event.id), availability.failed));
  },
  async getByIdRemote(eventId: string): Promise<Event | undefined> {
    const event = await apiRequest<EventResponse>(`/events/${eventId}`);
    const availability = await loadAvailability([event.id]);
    return mapRemoteEvent(event, availability.data.get(event.id), availability.failed);
  },
  async getPublicEventById(eventId: string): Promise<Event | undefined> {
    return this.getByIdRemote(eventId);
  },
  async create(data: EventPayload): Promise<Event> {
    return mapRemoteEvent(await apiRequest<EventResponse>("/events", {
      method: "POST",
      body: JSON.stringify(toEventRequest(data)),
    }));
  },
  async update(eventId: string, data: EventPayload): Promise<Event> {
    return mapRemoteEvent(await apiRequest<EventResponse>(`/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(toEventRequest(data)),
    }));
  },
  async changeStatus(eventId: string, status: BackendEventStatus): Promise<Event> {
    return mapRemoteEvent(await apiRequest<EventResponse>(`/events/${eventId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }));
  },
  async delete(eventId: string): Promise<void> {
    return apiRequest<void>(`/events/${eventId}`, { method: "DELETE" });
  },
};
