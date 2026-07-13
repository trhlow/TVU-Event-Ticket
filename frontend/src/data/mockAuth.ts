import { User } from '../types/user';

let currentUser: User | null = null;
let authenticated = false;

export function getCurrentUser(): User {
  return currentUser as User;
}

export function isAuthenticated(): boolean {
  return authenticated;
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    currentUser = user;
    authenticated = true;
    return;
  }

  currentUser = null;
  authenticated = false;
}
