import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { buildCanvasElementsFromIR } from '../mappers/canvas-ir.mapper';
import { CanvasElement } from '../models/canvas.models';
import { IRNode } from '../models/ir.models';
import { ProjectDesignResponse } from '../models/project.models';
import { ProjectService } from './project.service';

@Injectable({ providedIn: 'root' })
export class CanvasPersistenceService {
  private readonly projectService = inject(ProjectService);

  loadProjectDesign(
    projectId: number,
  ): Observable<{ elements: CanvasElement[]; updatedAt: string | null }> {
    return this.projectService.getDesign(projectId).pipe(
      map((response) => {
        const parsedIr = this.parseIr(response.designJson);
        const elements = buildCanvasElementsFromIR(parsedIr).map((element) =>
          this.withRoundedPrecision(element),
        );

        return {
          elements,
          updatedAt: response.updatedAt ?? null,
        };
      }),
    );
  }

  saveProjectDesign(projectId: number, ir: IRNode): Observable<ProjectDesignResponse> {
    const designJson = JSON.stringify(ir);
    return this.projectService.saveDesign(projectId, { designJson });
  }

  private parseIr(rawJson: string): IRNode | null {
    if (!rawJson?.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawJson) as IRNode;
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
