import { IRNode } from './ir.models';

export interface ConverterRequest {
  framework: string;
  ir: IRNode;
}

export interface ConverterResponse {
  framework: string;
  isValid: boolean;
  html: string;
  css: string;
}
