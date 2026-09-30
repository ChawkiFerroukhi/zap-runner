import { z } from 'zod';

export const configValuesSchema = z.record(z.string(), z.union([z.string(), z.boolean()]));

export type ConfigValues = z.infer<typeof configValuesSchema>;

export const stepInputSchema = z.object({
  type: z.string().min(1),
  config: configValuesSchema,
});

export const zapInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  draft: z.boolean().default(false),
  trigger: stepInputSchema,
  action: stepInputSchema,
});

export type ZapInput = z.infer<typeof zapInputSchema>;

export type ZapInputBody = z.input<typeof zapInputSchema>;

export interface ZapStep {
  type: string;
  config: ConfigValues;
}

export interface ZapWebhook {
  hookId: number;
  repository: string;
  verifiedAt: string | null;
}

export interface ZapLastRun {
  status: 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed';
  receivedAt: string;
}

export interface ZapDto {
  id: string;
  name: string;
  enabled: boolean;
  draft: boolean;
  trigger: ZapStep;
  action: ZapStep;
  webhook: ZapWebhook | null;
  lastRun: ZapLastRun | null;
  createdAt: string;
  updatedAt: string;
}
