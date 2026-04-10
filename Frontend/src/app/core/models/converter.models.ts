import { IRNode } from './ir.models';

export interface ConverterPageRequest {
  viewportWidth: number;
  pageName: string;
  ir: IRNode;
}

export interface ConverterRequest {
  framework: string;
  ir?: IRNode;
  pages?: ConverterPageRequest[];
}

export interface ConverterResponse {
  framework: string;
  isValid: boolean;
  html: string;
  css: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface MultiPageConverterResponse {
  framework: string;
  isValid: boolean;
  files: GeneratedFile[];
}
