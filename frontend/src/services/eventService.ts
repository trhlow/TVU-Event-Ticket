import { getEvents, saveEvents } from '../data/mockEvents';
import { Event } from '../types/event';
import { apiConfig, apiRequest } from './apiClient';

type EventPayload = Partial<Event>;

async function withEventFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
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
    return withEventFallback(() => apiRequest<Event[]>('/events'), () => getEvents());
  },
  async getPublicEvents(): Promise<Event[]> {
    return withEventFallback(() => apiRequest<Event[]>('/events'), () => getEvents());
  },
  async getFeaturedEvents(limit = 6): Promise<Event[]> {
    return withEventFallback(
      () => apiRequest<Event[]>(`/events?featured=true&limit=${limit}`),
      () => getEvents().filter((event) => event.status === 'OPEN' || event.status === 'UPCOMING').slice(0, limit),
    );
  },
  listByClub(clubId: string): Event[] {
    return getEvents().filter((event) => event.clubId === clubId);
  },
  async listByClubRemote(clubId: string): Promise<Event[]> {
    return withEventFallback(
      () => apiRequest<Event[]>(`/events?clubId=${encodeURIComponent(clubId)}`),
      () => getEvents().filter((event) => event.clubId === clubId),
    );
  },
  getById(eventId: string): Event | undefined {
    return getEvents().find((event) => event.id === eventId);
  },
  async getByIdRemote(eventId: string): Promise<Event | undefined> {
    return withEventFallback(() => apiRequest<Event>(`/events/${eventId}`), () => getEvents().find((event) => event.id === eventId));
  },
  async getPublicEventById(eventId: string): Promise<Event | undefined> {
    return withEventFallback(() => apiRequest<Event>(`/events/${eventId}`), () => getEvents().find((event) => event.id === eventId));
  },
  async create(data: Event): Promise<Event> {
    return withEventFallback(
      () =>
        apiRequest<Event>('/events', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      () => {
        const next = [data, ...getEvents()];
        saveEvents(next);
        return data;
      },
    );
  },
  async update(eventId: string, data: EventPayload): Promise<Event> {
    return withEventFallback(
      () =>
        apiRequest<Event>(`/events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      () => {
        const events = getEvents();
        const index = events.findIndex((event) => event.id === eventId);
        if (index === -1) throw new Error('Event not found');
        const updated = { ...events[index], ...data, id: eventId } as Event;
        events[index] = updated;
        saveEvents(events);
        return updated;
      },
    );
  },
  save(events: Event[]): void {
    saveEvents(events);
  },
};
