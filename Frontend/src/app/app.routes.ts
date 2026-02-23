import { Routes } from '@angular/router';
import { AuthPage } from './pages/auth-page/auth-page.component';
import { ProjectPage } from './pages/canvas-page/canvas-page.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: AuthPage },
  { path: 'canvas', component: ProjectPage },
];
