import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConverterRequest, ConverterResponse } from '../models/converter.models';

@Injectable({ providedIn: 'root' })
export class ConverterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  validate(request: ConverterRequest): Observable<ConverterResponse> {
    return this.http.post<ConverterResponse>(`${this.baseUrl}/converter/validate`, request, {
      withCredentials: true,
    });
  }

  generate(request: ConverterRequest): Observable<ConverterResponse> {
    return this.http.post<ConverterResponse>(`${this.baseUrl}/converter/generate`, request, {
      withCredentials: true,
    });
  }
}
