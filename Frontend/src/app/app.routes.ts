import { Routes } from '@angular/router';
import { AuthPage } from './features/auth/pages/auth-page.component';
import { ResetPasswordPage } from './features/auth/pages/reset-password-page.component';
import { ProjectPage } from './features/canvas/pages/canvas-page.component';
import { ProfilePage } from './features/profile/pages/profile-page.component';
import { SettingsPage } from './features/settings/pages/settings-page.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: AuthPage },
  { path: 'reset-password', component: ResetPasswordPage },
  { path: 'project/:id', component: ProjectPage },
  { path: 'settings', component: SettingsPage },
  { path: ':username', component: ProfilePage },
];
