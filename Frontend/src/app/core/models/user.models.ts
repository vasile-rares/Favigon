export interface UserProfile {
  userId: number;
  displayName: string;
  username: string;
  profilePictureUrl: string | null;
  createdAt: string;
}

export interface UserSearchResult {
  userId: number;
  displayName: string;
  username: string;
  profilePictureUrl: string | null;
}
