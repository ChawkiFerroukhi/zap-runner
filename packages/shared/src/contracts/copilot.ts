import { z } from 'zod';
import type { ZapDto } from './zap.js';

export const copilotProviderIds = ['gemini', 'openai', 'anthropic'] as const;

export type CopilotProviderId = (typeof copilotProviderIds)[number];

export type CopilotKeySource = 'account' | 'server';

export interface CopilotProviderInfo {
  id: CopilotProviderId;
  name: string;
  models: string[];
  keyUrl: string;
  pricing: 'free-tier' | 'paid';
}

export interface CopilotStatus {
  configured: boolean;
  source: CopilotKeySource | null;
  keyHint: string | null;
  provider: CopilotProviderInfo | null;
  providers: CopilotProviderInfo[];
}

export const copilotKeyInputSchema = z.object({
  provider: z.enum(copilotProviderIds),
  apiKey: z.string().trim().min(20, 'That does not look like an API key').max(400),
});

export const copilotDraftInputSchema = z.object({
  prompt: z.string().trim().min(8, 'Describe the Zap in a sentence or two').max(1000),
  answer: z
    .object({
      pendingId: z.string().min(1),
      value: z.string().trim().min(1).max(500),
    })
    .optional(),
});

export type CopilotDraftInput = z.infer<typeof copilotDraftInputSchema>;

export type CopilotStepId = 'repositories' | 'model' | 'check' | 'save';

export type CopilotStepState = 'active' | 'done' | 'skipped';

export type CopilotQuestion =
  | { pendingId: string; kind: 'repository'; text: string; options: string[] }
  | { pendingId: string; kind: 'text'; text: string };

export type CopilotEvent =
  | { type: 'step'; step: CopilotStepId; state: CopilotStepState; label: string }
  | { type: 'note'; step: CopilotStepId; message: string }
  | { type: 'question'; question: CopilotQuestion }
  | { type: 'drafted'; zap: ZapDto; explanation: string; model: string }
  | { type: 'unsupported'; message: string }
  | { type: 'failed'; code: string; message: string };
