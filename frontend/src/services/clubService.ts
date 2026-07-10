import { mockClubs } from '../data/mockClubs';
import { Club } from '../types/club';

export const clubService = {
  list(): Club[] {
    return mockClubs;
  },
  getById(clubId: string): Club | undefined {
    return mockClubs.find((club) => club.id === clubId);
  },
};
