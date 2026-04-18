export const FALLBACK_AVATAR_URL = '/assets/default-avatar.svg';

export interface UserProfile {
  userId: number;
  displayName: string;
  username: string;
  profilePictureUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export interface UserSearchResult {
  userId: number;
  displayName: string;
  username: string;
  profilePictureUrl: string | null;
}

export interface LinkedAccountInfo {
  provider: string;
  providerEmail: string;
  createdAt: string;
}

export interface UserMe {
  userId: number;
  displayName: string;
  username: string;
  email: string;
  hasPassword: boolean;
  isTwoFactorEnabled: boolean;
  role: string;
  profilePictureUrl: string | null;
  bio: string | null;
  createdAt: string;
  linkedAccounts: LinkedAccountInfo[];
}

export interface UserProfileUpdateRequest {
  displayName: string;
  username: string;
  bio: string | null;
}
