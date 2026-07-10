import { mockUsers } from '../data/mockUsers';
import { User } from '../types/user';

export const userService = {
  list(): User[] {
    return mockUsers;
  },
  listOrganizers(): User[] {
    return mockUsers.filter((user) => user.role === 'ORGANIZER');
  },
  listStudents(): User[] {
    return mockUsers.filter((user) => user.role === 'SINH_VIEN');
  },
};
