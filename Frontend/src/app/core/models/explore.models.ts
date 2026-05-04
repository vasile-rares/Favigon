export interface ExploreProjectItem {
  projectId: number;
  name: string;
  slug: string;
  thumbnailDataUrl: string | null;
  starCount: number;
  viewCount: number;
  isStarredByCurrentUser: boolean;
  updatedAt: string;
  ownerUserId: number;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerProfilePictureUrl: string | null;
}

export interface ExploreUserItem {
  userId: number;
  username: string;
  displayName: string;
  profilePictureUrl: string | null;
  followerCount: number;
  publicProjectCount: number;
  isFollowedByCurrentUser: boolean;
}

export interface ExploreRecommendedResponse {
  isPersonalized: boolean;
  projects: ExploreProjectItem[];
}
