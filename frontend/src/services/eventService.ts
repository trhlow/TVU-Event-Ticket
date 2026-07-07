import { getEvents, saveEvents } from '../data/mockEvents';
import { Event } from '../types/event';

export const eventService = {
  list(): Event[] {
    return getEvents();
  },
  listByClub(clubId: string): Event[] {
    return getEvents().filter((event) => event.clubId === clubId);
  },
  getById(eventId: string): Event | undefined {
    return getEvents().find((event) => event.id === eventId);
  },
  save(events: Event[]): void {
    saveEvents(events);
  },
};
