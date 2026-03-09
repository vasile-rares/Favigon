import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthMessageResponse,
  ForgotPasswordRequest,
  GithubAuthRequest,
  GoogleAuthRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  login(request: LoginRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/login`, request);
  }

  register(request: RegisterRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/register`, request);
  }

  loginWithGithub(request: GithubAuthRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/oauth2/github`, request);
  }

  loginWithGoogle(request: GoogleAuthRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/oauth2/google`, request);
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/forgot-password`, request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/reset-password`, request);
  }

  logout(): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${this.baseUrl}/account/logout`, {});
  }
}
