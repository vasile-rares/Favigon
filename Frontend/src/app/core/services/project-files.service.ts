import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ProjectResponse,
  ProjectFileEntryResponse,
  ProjectFileContentResponse,
} from '../models/project-files.models';

@Injectable({ providedIn: 'root' })
export class ProjectFilesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  login(email: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/auth/login`,
      { email, password },
      { withCredentials: true },
    );
  }

  getProjects(): Observable<ProjectResponse[]> {
    return this.http.get<ProjectResponse[]>(`${this.baseUrl}/projects`, {
      withCredentials: true,
    });
  }

  getProjectFiles(projectId: number): Observable<ProjectFileEntryResponse[]> {
    return this.http.get<ProjectFileEntryResponse[]>(
      `${this.baseUrl}/projects/${projectId}/files`,
      { withCredentials: true },
    );
  }

  getProjectFileContent(projectId: number, path: string): Observable<ProjectFileContentResponse> {
    return this.http.get<ProjectFileContentResponse>(
      `${this.baseUrl}/projects/${projectId}/files/content`,
      { params: { path }, withCredentials: true },
    );
  }

  updateProjectFileContent(projectId: number, path: string, content: string): Observable<void> {
    return this.http.put<void>(
      `${this.baseUrl}/projects/${projectId}/files/content`,
      { path, content },
      { withCredentials: true },
    );
  }
}
