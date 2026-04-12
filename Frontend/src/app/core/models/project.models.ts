export interface ProjectResponse {
  projectId: number;
  userId: number;
  name: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl?: string | null;
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
