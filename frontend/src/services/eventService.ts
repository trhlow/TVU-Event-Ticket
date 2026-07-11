import { getEvents, saveEvents } from "../data/mockEvents";
import { Event } from "../types/event";
import { apiConfig, apiRequest } from "./apiClient";

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

function mapRemoteEvent(event: EventResponse, availability?: AvailabilityResponse): Event {
  return {
    id: event.id,
    clubId: event.clubId,
    clubName: "Cau lac bo TVU",
    title: event.title,
    description: event.description || "",
    category: "Su kien",
    bannerUrl: "",
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    registrationOpenAt: event.registrationOpenAt,
    registrationCloseAt: event.registrationCloseAt,
    capacity: availability?.totalCapacity ?? event.capacity,
    remainingTickets: availability?.remaining ?? event.capacity,
    status: event.status,
  };
}

function toEventRequest(data: EventPayload): EventRequest {
  return {
    title: data.title?.trim() || "",
    description: data.description?.trim() || "",
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

async function loadAvailability(eventIds: string[]): Promise<Map<string, AvailabilityResponse>> {
  if (eventIds.length === 0) return new Map();
  try {
    const params = encodeURIComponent(eventIds.slice(0, 100).join(","));
    const response = await apiRequest<Record<string, AvailabilityResponse>>(`/ticketing/events/availability?ids=${params}`);
    return new Map(Object.entries(response));
  } catch {
    return new Map();
  }
}

async function withEventFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  if (apiConfig.useDemoData) return fallback();
  try {
    return await request();
  } catch (error) {
    if (!apiConfig.enableMockFallback) throw error;
    return fallback();
  }
}

export const eventService = {
  list(): Event[] {
    return getEvents();
  },
  async listRemote(): Promise<Event[]> {
    return this.getPublicEvents();
  },
  async getPublicEvents(): Promise<Event[]> {
    return withEventFallback(
      async () => {
        const events = await apiRequest<EventResponse[]>("/events");
        const availability = await loadAvailability(events.map((event) => event.id));
        return events.map((event) => mapRemoteEvent(event, availability.get(event.id)));
      },
      () => getEvents(),
    );
  },
  async getFeaturedEvents(limit = 6): Promise<Event[]> {
    return withEventFallback(
      async () => (await this.getPublicEvents()).filter((event) => event.status === "OPEN").slice(0, limit),
      () => getEvents().filter((event) => event.status === "OPEN" || event.status === "UPCOMING").slice(0, limit),
    );
  },
  listByClub(clubId: string): Event[] {
    return getEvents().filter((event) => event.clubId === clubId);
  },
  async listByClubRemote(clubId: string): Promise<Event[]> {
    return withEventFallback(
      async () => {
        void clubId;
        const events = await apiRequest<EventResponse[]>("/events/mine");
        const availability = await loadAvailability(events.map((event) => event.id));
        return events.map((event) => mapRemoteEvent(event, availability.get(event.id)));
      },
      () => getEvents().filter((event) => event.clubId === clubId),
    );
  },
  getById(eventId: string): Event | undefined {
    return getEvents().find((event) => event.id === eventId);
  },
  async getByIdRemote(eventId: string): Promise<Event | undefined> {
    return withEventFallback(
      async () => {
        const event = await apiRequest<EventResponse>(`/events/${eventId}`);
        const availability = await loadAvailability([event.id]);
        return mapRemoteEvent(event, availability.get(event.id));
      },
      () => getEvents().find((event) => event.id === eventId),
    );
  },
  async getPublicEventById(eventId: string): Promise<Event | undefined> {
    return this.getByIdRemote(eventId);
  },
  async create(data: EventPayload): Promise<Event> {
    return withEventFallback(
      async () => mapRemoteEvent(await apiRequest<EventResponse>("/events", {
        method: "POST",
        body: JSON.stringify(toEventRequest(data)),
      })),
      () => {
        const event = data as Event;
        const next = [event, ...getEvents()];
        saveEvents(next);
        return event;
      },
    );
  },
  async update(eventId: string, data: EventPayload): Promise<Event> {
    return withEventFallback(
      async () => mapRemoteEvent(await apiRequest<EventResponse>(`/events/${eventId}`, {
        method: "PUT",
        body: JSON.stringify(toEventRequest(data)),
      })),
      () => {
        const events = getEvents();
        const index = events.findIndex((event) => event.id === eventId);
        if (index === -1) throw new Error("Event not found");
        const updated = { ...events[index], ...data, id: eventId } as Event;
        events[index] = updated;
        saveEvents(events);
        return updated;
      },
    );
  },
  async changeStatus(eventId: string, status: BackendEventStatus): Promise<Event> {
    return withEventFallback(
      async () => mapRemoteEvent(await apiRequest<EventResponse>(`/events/${eventId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })),
      () => {
        const events = getEvents();
        const index = events.findIndex((event) => event.id === eventId);
        if (index === -1) throw new Error("Event not found");
        const updated = { ...events[index], status } as Event;
        events[index] = updated;
        saveEvents(events);
        return updated;
      },
    );
  },
  async delete(eventId: string): Promise<void> {
    return withEventFallback(
      () => apiRequest<void>(`/events/${eventId}`, { method: "DELETE" }),
      () => {
        saveEvents(getEvents().filter((event) => event.id !== eventId));
      },
    );
  },
  save(events: Event[]): void {
    saveEvents(events);
  },
};
