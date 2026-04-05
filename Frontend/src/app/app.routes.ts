import { Routes } from '@angular/router';
import { authGuard } from '@app/core';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/auth-page.component').then((m) => m.AuthPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/pages/reset-password-page.component').then(
        (m) => m.ResetPasswordPage,
      ),
  },
  {
    path: 'project/:id/preview',
    loadComponent: () =>
      import('./features/canvas/pages/canvas-preview-page.component').then(
        (m) => m.CanvasPreviewPage,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'project/:id',
    loadComponent: () =>
      import('./features/canvas/pages/canvas-page.component').then((m) => m.CanvasPage),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/pages/settings-page.component').then((m) => m.SettingsPage),
    canActivate: [authGuard],
  },
  {
    path: ':username',
    loadComponent: () =>
      import('./features/profile/pages/profile-page.component').then((m) => m.ProfilePage),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '/login' },
];
