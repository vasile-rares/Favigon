export interface ProjectResponse {
  projectId: number;
  userId: number;
  name: string;
  type: string;
  rootPath: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileEntryResponse {
  path: string;
  name: string;
  extension: string;
  size: number;
}

export interface ProjectFileContentResponse {
  path: string;
  content: string;
}
