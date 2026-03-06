import { Routes } from '@angular/router';
import { AuthPage } from './features/auth/pages/auth-page.component';
import { ProjectPage } from './features/editor/pages/canvas-page.component';
import { DashboardPage } from './features/dashboard/pages/dashboard-page.component';
import { SettingsPage } from './features/settings/pages/settings-page.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: AuthPage },
  { path: 'dashboard', component: DashboardPage },
  { path: 'project/:id', component: ProjectPage },
  { path: 'settings', component: SettingsPage },
];
