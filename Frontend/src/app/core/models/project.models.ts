export interface ProjectResponse {
  projectId: number;
  userId: number;
  name: string;
  slug: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl?: string | null;
  starCount: number;
  viewCount?: number;
  isStarredByCurrentUser: boolean;
  likeCount?: number;
  isLikedByCurrentUser?: boolean;
  forkedFromProjectId?: number | null;
  forkedFromOwnerUsername?: string | null;
}

export interface ProjectCreateRequest {
  name: string;
  isPublic: boolean;
}

export interface ProjectUpdateRequest {
  name: string;
  isPublic: boolean;
}

export interface ProjectDesignResponse {
  projectId: number;
  designJson: string;
  updatedAt: string;
}

export interface ProjectDesignSaveRequest {
  designJson: string;
}

export interface ProjectImageUploadResponse {
  assetUrl: string;
}
