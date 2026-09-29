import type { CopilotProviderId } from '@zap-runner/shared';
import { createAnthropicCopilotModel } from './anthropic-copilot-model.js';
import type { CopilotModel } from './copilot-model.js';
import { createGeminiCopilotModel } from './gemini-copilot-model.js';
import { createOpenAiCopilotModel } from './openai-copilot-model.js';

export type CopilotModels = Record<CopilotProviderId, CopilotModel>;

export interface CopilotModelSettings {
  geminiModels: string[];
  openaiModel: string;
  anthropicModel: string;
}

export function createCopilotModels(settings: CopilotModelSettings): CopilotModels {
  return {
    gemini: createGeminiCopilotModel(settings.geminiModels),
    openai: createOpenAiCopilotModel(settings.openaiModel),
    anthropic: createAnthropicCopilotModel(settings.anthropicModel),
  };
}
