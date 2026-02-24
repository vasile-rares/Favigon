import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthMessageResponse,
  GithubAuthRequest,
  LoginRequest,
  RegisterRequest,
} from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  login(request: LoginRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/auth/login`, request, {
      withCredentials: true,
    });
  }

  register(request: RegisterRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/auth/register`, request, {
      withCredentials: true,
    });
  }

  loginWithGithub(request: GithubAuthRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/auth/github`, request, {
      withCredentials: true,
    });
  }

  logout(): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(
      `${this.baseUrl}/auth/logout`,
      {},
      { withCredentials: true },
    );
  }
}
