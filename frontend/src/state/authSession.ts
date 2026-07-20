import { User } from '../types/user';

let currentUser: User | null = null;
let authenticated = false;

export function getCurrentUser(): User | null {
  return currentUser;
}

export function requireCurrentUser(): User {
  if (!currentUser) {
    throw new Error("Authenticated user is required for this route.");
  }
  return currentUser;
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
