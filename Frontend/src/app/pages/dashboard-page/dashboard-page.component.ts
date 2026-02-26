import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HeaderBarComponent } from '../../components/ui/header-bar/header-bar.component';

interface Project {
  id: string;
  name: string;
  lastEdited: Date;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderBarComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css',
})
export class DashboardPage {
  private readonly router = inject(Router);

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
}
