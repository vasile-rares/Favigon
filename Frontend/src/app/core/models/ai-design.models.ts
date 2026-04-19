import { IRNode } from './ir.models';

export interface AiDesignRequest {
  prompt: string;
  existingIr?: IRNode;
  viewportWidth?: number;
}

export interface AiDesignResponse {
  success: boolean;
  ir?: IRNode;
  message?: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ir?: IRNode;
  error?: boolean;
  isStreaming?: boolean;
  timestamp: number;
}
