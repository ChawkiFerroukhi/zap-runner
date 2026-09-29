import type { CopilotProviderInfo, RegistryResponse } from '@zap-runner/shared';
import { z } from 'zod';

const configEntry = z.object({
  key: z.string(),
  value: z.union([z.string(), z.boolean()]),
});

export const copilotDraftSchema = z.object({
  status: z.enum(['ready', 'needs_repository', 'needs_clarification', 'unsupported']),
  explanation: z.string(),
  question: z.string(),
  name: z.string(),
  triggerId: z.string(),
  triggerConfig: z.array(configEntry),
  actionId: z.string(),
  actionConfig: z.array(configEntry),
});

export type CopilotDraft = z.infer<typeof copilotDraftSchema>;

export interface CopilotRequest {
  prompt: string;
  registry: RegistryResponse;
  repositories: string[];
  clarification?: string;
  correction?: { previous: CopilotDraft; problems: string[] };
}

export class CopilotKeyRejected extends Error {}

export class CopilotUnavailable extends Error {}

export interface CopilotAnswer {
  draft: CopilotDraft;
  model: string;
}

export interface CopilotObserver {
  fallback(from: string, to: string, reason: string): void;
}

export interface CopilotModel {
  provider: CopilotProviderInfo;
  verifyKey(apiKey: string): Promise<void>;
  draft(
    apiKey: string,
    request: CopilotRequest,
    observer?: CopilotObserver,
  ): Promise<CopilotAnswer>;
}
