import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const apiCredentialsInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiBaseUrl) || request.withCredentials) {
    return next(request);
  }

  return next(request.clone({ withCredentials: true }));
};
