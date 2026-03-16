import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  buildCanvasProjectDocumentFromUnknown,
  buildPersistedCanvasDesign,
} from '../mappers/canvas-ir.mapper';
import { CanvasPageModel, CanvasProjectDocument } from '../../../core/models/canvas.models';
import { ProjectDesignResponse } from '../../../core/models/project.models';
import { ProjectService } from '../../../core/services/project.service';
import { withRoundedPrecision } from '../utils/canvas-interaction.util';

@Injectable({ providedIn: 'root' })
export class CanvasPersistenceService {
  private readonly projectService = inject(ProjectService);

  loadProjectDesign(projectId: number): Observable<{
    pages: CanvasPageModel[];
    activePageId: string | null;
    updatedAt: string | null;
  }> {
    return this.projectService.getDesign(projectId).pipe(
      map((response) => {
        const parsedDesign = this.parseDesign(response.designJson);
        const projectDocument = buildCanvasProjectDocumentFromUnknown(
          parsedDesign,
          projectId.toString(),
        );

        return {
          pages: projectDocument.pages.map((page) => ({
            ...page,
            elements: page.elements.map((element) => withRoundedPrecision(element)),
          })),
          activePageId: projectDocument.activePageId,
          updatedAt: response.updatedAt ?? null,
        };
      }),
    );
  }

  saveProjectDesign(
    projectId: number,
    document: CanvasProjectDocument,
  ): Observable<ProjectDesignResponse> {
    const designJson = JSON.stringify(buildPersistedCanvasDesign(document));
    return this.projectService.saveDesign(projectId, { designJson });
  }

  saveProjectThumbnail(projectId: number, thumbnailDataUrl: string): Observable<void> {
    return this.projectService.saveThumbnail(projectId, thumbnailDataUrl);
  }

  private parseDesign(rawJson: string): unknown {
    if (!rawJson?.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawJson) as unknown;
    } catch {
      return null;
    }
  }
}
