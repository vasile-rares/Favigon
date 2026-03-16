import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  UserMe,
  UserProfile,
  UserProfileUpdateRequest,
  UserSearchResult,
} from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getMe(): Observable<UserMe> {
    return this.http.get<UserMe>(`${this.baseUrl}/users/me`);
  }

  updateMe(request: UserProfileUpdateRequest): Observable<UserMe> {
    return this.http.put<UserMe>(`${this.baseUrl}/users/me`, request);
  }

  deleteMe(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/users/me`);
  }

  unlinkProvider(provider: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/users/me/linked-accounts/${encodeURIComponent(provider)}`,
    );
  }

  getByUsername(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/users/${encodeURIComponent(username)}`);
  }

  search(query: string): Observable<UserSearchResult[]> {
    return this.http.get<UserSearchResult[]>(`${this.baseUrl}/users/search`, {
      params: { q: query },
    });
  }
}
