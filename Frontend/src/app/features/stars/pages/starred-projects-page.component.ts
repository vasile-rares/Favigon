import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectService, extractApiErrorMessage } from '@app/core';
import type { ProjectResponse } from '@app/core';
import {
  ProjectCardComponent,
  ProjectCardViewModel,
} from '../../profile/components/project-card/project-card.component';

@Component({
  selector: 'app-starred-projects-page',
  standalone: true,
  imports: [ProjectCardComponent],
  templateUrl: './starred-projects-page.component.html',
  styleUrl: './starred-projects-page.component.css',
})
export class StarredProjectsPage implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projects = signal<ProjectCardViewModel[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.projectService
      .getMyStars()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.projects.set(list.map((p) => this.mapToCard(p)));
          this.isLoading.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(extractApiErrorMessage(err, 'Failed to load starred projects.'));
          this.isLoading.set(false);
        },
      });
  }

  toggleStar(project: ProjectCardViewModel): void {
    const wasStarred = project.isStarredByCurrentUser;

    // Optimistic removal (unstar)
    this.projects.update((list) =>
      list.map((p) =>
        p.id === project.id
          ? {
              ...p,
              isStarredByCurrentUser: !wasStarred,
              starCount: wasStarred ? p.starCount - 1 : p.starCount + 1,
            }
          : p,
      ),
    );

    const request$ = wasStarred
      ? this.projectService.unstarProject(project.id)
      : this.projectService.starProject(project.id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (wasStarred) {
          // Remove from stars list after unstarring
          this.projects.update((list) => list.filter((p) => p.id !== project.id));
        }
      },
      error: () => {
        // Rollback on error
        this.projects.update((list) =>
          list.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  isStarredByCurrentUser: wasStarred,
                  starCount: wasStarred ? p.starCount + 1 : p.starCount - 1,
                }
              : p,
          ),
        );
      },
    });
  }

  private mapToCard(project: ProjectResponse): ProjectCardViewModel {
    return {
      id: project.projectId,
      slug: project.slug,
      name: project.name,
      isPublic: project.isPublic,
      createdAt: new Date(project.createdAt),
      lastEdited: new Date(project.updatedAt),
      thumbnailDataUrl: project.thumbnailDataUrl ?? null,
      starCount: project.starCount ?? 0,
      viewCount: project.viewCount ?? 0,
      isStarredByCurrentUser: project.isStarredByCurrentUser ?? true,
      likeCount: project.likeCount ?? 0,
      isLikedByCurrentUser: project.isLikedByCurrentUser ?? false,
    };
  }
}
