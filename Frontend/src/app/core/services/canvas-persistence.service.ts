import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  buildCanvasProjectDocumentFromUnknown,
  buildPersistedCanvasDesign,
} from '../mappers/canvas-ir.mapper';
import { CanvasElement, CanvasPageModel, CanvasProjectDocument } from '../models/canvas.models';
import { ProjectDesignResponse } from '../models/project.models';
import { ProjectService } from './project.service';

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
            elements: page.elements.map((element) => this.withRoundedPrecision(element)),
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

  private withRoundedPrecision(element: CanvasElement): CanvasElement {
    return {
      ...element,
      x: this.roundToTwoDecimals(element.x),
      y: this.roundToTwoDecimals(element.y),
      width: this.roundToTwoDecimals(element.width),
      height: this.roundToTwoDecimals(element.height),
      strokeWidth:
        typeof element.strokeWidth === 'number'
          ? this.roundToTwoDecimals(element.strokeWidth)
          : undefined,
      fontSize:
        typeof element.fontSize === 'number'
          ? this.roundToTwoDecimals(element.fontSize)
          : undefined,
    };
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
