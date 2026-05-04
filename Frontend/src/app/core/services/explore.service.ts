import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ExploreProjectItem,
  ExploreUserItem,
  ExploreRecommendedResponse,
} from '../models/explore.models';

@Injectable({ providedIn: 'root' })
export class ExploreService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getTrending(): Observable<ExploreProjectItem[]> {
    return this.http
      .get<ExploreProjectItem[]>(`${this.baseUrl}/explore/trending`)
      .pipe(map((items) => items.map((p) => this.normalizeProjectItem(p))));
  }

  getRecommended(): Observable<ExploreRecommendedResponse> {
    return this.http
      .get<ExploreRecommendedResponse>(`${this.baseUrl}/explore/recommended`)
      .pipe(
        map((res) => ({ ...res, projects: res.projects.map((p) => this.normalizeProjectItem(p)) })),
      );
  }

  getSuggestedPeople(): Observable<ExploreUserItem[]> {
    return this.http
      .get<ExploreUserItem[]>(`${this.baseUrl}/explore/people`)
      .pipe(map((items) => items.map((u) => this.normalizeUserItem(u))));
  }

  recordView(projectId: number): void {
    this.http
      .post(`${this.baseUrl}/projects/${projectId}/view`, null)
      .subscribe({ error: () => {} });
  }

  private normalizeProjectItem(p: ExploreProjectItem): ExploreProjectItem {
    return {
      ...p,
      thumbnailDataUrl: this.resolveAssetUrl(p.thumbnailDataUrl),
      ownerProfilePictureUrl: this.resolveAssetUrl(p.ownerProfilePictureUrl),
    };
  }

  private normalizeUserItem(u: ExploreUserItem): ExploreUserItem {
    return { ...u, profilePictureUrl: this.resolveAssetUrl(u.profilePictureUrl) };
  }

  private resolveAssetUrl(url: string | null | undefined): string | null {
    const normalized = url?.trim();
    if (!normalized) return null;
    if (/^(?:data:|https?:)/i.test(normalized)) return normalized;
    try {
      return new URL(normalized, this.getApiOrigin()).toString();
    } catch {
      return normalized;
    }
  }

  private getApiOrigin(): string {
    try {
      const base =
        typeof window !== 'undefined'
          ? new URL(this.baseUrl, window.location.origin)
          : new URL(this.baseUrl);
      return base.origin;
    } catch {
      return typeof window !== 'undefined' ? window.location.origin : '';
    }
  }
}
