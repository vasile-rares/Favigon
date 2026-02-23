import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface Project {
  id: string;
  name: string;
  lastEdited: Date;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css',
})
export class DashboardPage {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  // Mock data for projects
  projects = signal<Project[]>([
    { id: '1', name: 'Design System', lastEdited: new Date() },
    { id: '2', name: 'Mobile App Mockup', lastEdited: new Date(Date.now() - 86400000) },
    { id: '3', name: 'Landing Page', lastEdited: new Date(Date.now() - 172800000) },
  ]);

  createNewProject() {
    const newId = crypto.randomUUID();
    // In a real app, we would call a service to create the project in the backend first
    console.log('Creating new project:', newId);
    this.router.navigate(['/project', newId]);
  }

  openProject(projectId: string) {
    console.log('Opening project:', projectId);
    this.router.navigate(['/project', projectId]);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
