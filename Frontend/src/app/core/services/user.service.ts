import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserProfile, UserSearchResult } from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.baseUrl}/users/me`);
  }

  getByUsername(username: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      `${this.baseUrl}/users/${encodeURIComponent(username)}`,
    );
  }

  search(query: string): Observable<UserSearchResult[]> {
    return this.http.get<UserSearchResult[]>(`${this.baseUrl}/users/search`, {
      params: { q: query },
    });
  }
}
