import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConverterRequest, ConverterResponse } from '../../../core/models/converter.models';
import { IRNode } from '../../../core/models/ir.models';
import { ConverterService } from '../../../core/services/converter.service';

@Injectable({ providedIn: 'root' })
export class CanvasGenerationService {
  private readonly converterService = inject(ConverterService);

  validate(framework: ConverterRequest['framework'], ir: IRNode): Observable<ConverterResponse> {
    return this.converterService.validate({ framework, ir });
  }

  generate(framework: ConverterRequest['framework'], ir: IRNode): Observable<ConverterResponse> {
    return this.converterService.generate({ framework, ir });
  }
}
