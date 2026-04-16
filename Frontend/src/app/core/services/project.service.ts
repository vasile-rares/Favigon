import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ProjectCreateRequest,
  ProjectDesignResponse,
  ProjectDesignSaveRequest,
  ProjectImageUploadResponse,
  ProjectResponse,
  ProjectUpdateRequest,
} from '../models/project.models';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getProjects(): Observable<ProjectResponse[]> {
    return this.http
      .get<ProjectResponse[]>(`${this.baseUrl}/projects`)
      .pipe(map((projects) => projects.map((project) => this.normalizeProjectResponse(project))));
  }

  getById(projectId: number): Observable<ProjectResponse> {
    return this.http
      .get<ProjectResponse>(`${this.baseUrl}/projects/${projectId}`)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  getBySlug(slug: string): Observable<ProjectResponse> {
    return this.http
      .get<ProjectResponse>(`${this.baseUrl}/projects/by-slug/${encodeURIComponent(slug)}`)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  create(request: ProjectCreateRequest): Observable<ProjectResponse> {
    return this.http
      .post<ProjectResponse>(`${this.baseUrl}/projects`, request)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  update(projectId: number, request: ProjectUpdateRequest): Observable<ProjectResponse> {
    return this.http
      .put<ProjectResponse>(`${this.baseUrl}/projects/${projectId}`, request)
      .pipe(map((project) => this.normalizeProjectResponse(project)));
  }

  delete(projectId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/projects/${projectId}`);
  }

  getByUserId(userId: number, isPublic?: boolean): Observable<ProjectResponse[]> {
    const params: Record<string, string> = {};
    if (isPublic !== undefined) {
      params['isPublic'] = String(isPublic);
    }
    return this.http
      .get<ProjectResponse[]>(`${this.baseUrl}/projects/user/${userId}`, { params })
      .pipe(map((projects) => projects.map((project) => this.normalizeProjectResponse(project))));
  }

  getDesign(projectId: number): Observable<ProjectDesignResponse> {
    return this.http.get<ProjectDesignResponse>(`${this.baseUrl}/projects/${projectId}/design`);
  }

  saveDesign(
    projectId: number,
    request: ProjectDesignSaveRequest,
  ): Observable<ProjectDesignResponse> {
    return this.http.put<ProjectDesignResponse>(
      `${this.baseUrl}/projects/${projectId}/design`,
      request,
    );
  }

  flushProjectOnExit(
    projectId: number,
    designJson: string,
    thumbnailFile: Blob | null,
  ): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/projects/${projectId}/flush`,
      this.createExitFlushFormData(designJson, thumbnailFile),
    );
  }

  saveThumbnail(projectId: number, thumbnailFile: Blob): Observable<void> {
    const formData = new FormData();
    formData.append('file', thumbnailFile, this.getThumbnailFileName(thumbnailFile.type));
    return this.http.put<void>(`${this.baseUrl}/projects/${projectId}/thumbnail`, formData);
  }

  uploadImageAsset(projectId: number, file: File): Observable<ProjectImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ProjectImageUploadResponse>(
      `${this.baseUrl}/projects/${projectId}/assets/images`,
      formData,
    );
  }

  dispatchExitFlush(projectId: number, designJson: string, thumbnailFile: Blob | null): void {
    if (typeof fetch !== 'function') {
      return;
    }

    try {
      void fetch(`${this.baseUrl}/projects/${projectId}/flush`, {
        method: 'POST',
        body: this.createExitFlushFormData(designJson, thumbnailFile),
        credentials: 'include',
        keepalive: true,
      });
    } catch {
      // Best-effort only during browser unload.
    }
  }

  private getThumbnailFileName(contentType: string): string {
    switch (contentType) {
      case 'image/png':
        return 'thumbnail.png';
      case 'image/webp':
        return 'thumbnail.webp';
      default:
        return 'thumbnail.jpg';
    }
  }

  private createExitFlushFormData(designJson: string, thumbnailFile: Blob | null): FormData {
    const formData = new FormData();
    formData.append('designJson', designJson);
    if (thumbnailFile) {
      formData.append(
        'thumbnailFile',
        thumbnailFile,
        this.getThumbnailFileName(thumbnailFile.type),
      );
    }
    return formData;
  }

  private normalizeProjectResponse(project: ProjectResponse): ProjectResponse {
    return {
      ...project,
      thumbnailDataUrl: this.resolveProjectAssetUrl(project.thumbnailDataUrl),
    };
  }

  private resolveProjectAssetUrl(url: string | null | undefined): string | null {
    const normalized = url?.trim();
    if (!normalized) {
      return null;
    }

    if (/^(?:data:|https?:)/i.test(normalized)) {
      return normalized;
    }

    const apiOrigin = this.getApiOrigin();
    if (!apiOrigin) {
      return normalized;
    }

    try {
      return new URL(normalized, apiOrigin).toString();
    } catch {
      return normalized;
    }
  }

  private getApiOrigin(): string | null {
    try {
      const base =
        typeof window !== 'undefined'
          ? new URL(this.baseUrl, window.location.origin)
          : new URL(this.baseUrl);
      return base.origin;
    } catch {
      return typeof window !== 'undefined' ? window.location.origin : null;
    }
  }
}
