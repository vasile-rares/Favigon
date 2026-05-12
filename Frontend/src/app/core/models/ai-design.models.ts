import { IRNode } from './ir.models';

export interface AiDesignRequest {
  prompt: string;
  existingIr?: IRNode;
  viewportWidth?: number;
  model?: string;
}

export interface AiDesignResponse {
  success: boolean;
  ir?: IRNode;
  message?: string;
}

// ── 3-Phase Pipeline ──────────────────────────────────────────────────────

export interface AiPipelineRequest {
  prompt: string;
  existingIr?: IRNode;
  viewportWidth?: number;
  model?: string;
  /** 1 = intent only, 2 = intent + structure, 3 = full pipeline (default) */
  stopAfterPhase?: 1 | 2 | 3;
}

export interface IntentSection {
  name: string;
  purpose: string;
  layoutHint: string;
  order: number;
}

export interface IntentBlueprint {
  pageType: string;
  colorMood: string;
  brandPersonality: string;
  targetAudience: string;
  primaryCta: string;
  sections: IntentSection[];
}

export interface AiPipelineResponse {
  success: boolean;
  message?: string;
  /** Phase 1 output — always present on success. */
  intent?: IntentBlueprint;
  /** Phase 2 output — structural wireframe, no decoration. Present when stopAfterPhase >= 2. */
  structure?: IRNode;
  /** Phase 3 output — fully styled IRNode. Present when stopAfterPhase == 3. */
  ir?: IRNode;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ir?: IRNode;
  error?: boolean;
  isStreaming?: boolean;
  timestamp: number;
}
