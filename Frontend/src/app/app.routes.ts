import { Routes } from '@angular/router';
import { AuthPage } from './features/auth/pages/auth-page.component';
import { ResetPasswordPage } from './features/auth/pages/reset-password-page.component';
import { ProjectPage } from './features/canvas/pages/canvas-page.component';
import { CanvasPreviewPage } from './features/canvas/pages/canvas-preview-page.component';
import { ProfilePage } from './features/profile/pages/profile-page.component';
import { SettingsPage } from './features/settings/pages/settings-page.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: AuthPage },
  { path: 'reset-password', component: ResetPasswordPage },
  { path: 'project/:id/preview', component: CanvasPreviewPage, canActivate: [authGuard] },
  { path: 'project/:id', component: ProjectPage, canActivate: [authGuard] },
  { path: 'settings', component: SettingsPage, canActivate: [authGuard] },
  { path: ':username', component: ProfilePage, canActivate: [authGuard] },
];
