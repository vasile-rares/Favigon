import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ProjectCreateRequest,
  ProjectDesignResponse,
  ProjectDesignSaveRequest,
  ProjectResponse,
} from '../models/project.models';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getProjects(): Observable<ProjectResponse[]> {
    return this.http.get<ProjectResponse[]>(`${this.baseUrl}/projects`);
  }

  getById(projectId: number): Observable<ProjectResponse> {
    return this.http.get<ProjectResponse>(`${this.baseUrl}/projects/${projectId}`);
  }

  create(request: ProjectCreateRequest): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${this.baseUrl}/projects`, request);
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
}
