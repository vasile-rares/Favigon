import { Routes } from '@angular/router';
import { AuthPage } from './pages/auth-page/auth-page.component';
import { ProjectPage } from './pages/canvas-page/canvas-page.component';
import { DashboardPage } from './pages/dashboard-page/dashboard-page.component';
import { SettingsPage } from './pages/settings-page/settings-page.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: AuthPage },
  { path: 'dashboard', component: DashboardPage },
  { path: 'project/:id', component: ProjectPage },
  { path: 'settings', component: SettingsPage },
];
