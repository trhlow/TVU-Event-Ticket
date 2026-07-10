import { User } from './user';

export interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
}
