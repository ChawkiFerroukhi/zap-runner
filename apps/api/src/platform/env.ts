import { copilotProviderIds } from '@zap-runner/shared';
import { z } from 'zod';

const encryptionKey = z.string().transform((value, context) => {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    context.addIssue({ code: 'custom', message: 'Must be 32 bytes encoded as base64' });
    return z.NEVER;
  }
  return key;
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGO_URL: z.string().startsWith('mongodb'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  APP_URL: z.url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_REPO_ACCESS: z.enum(['public', 'all']).default('public'),
  ENCRYPTION_KEY: encryptionKey,
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  WEBHOOK_PUBLIC_URL: z.url(),
  COPILOT_PROVIDER: z.enum(copilotProviderIds).default('gemini'),
  COPILOT_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  COPILOT_GEMINI_MODELS: z
    .string()
    .default('gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite')
    .transform((value) =>
      value
        .split(',')
        .map((model) => model.trim())
        .filter((model) => model !== ''),
    ),
  COPILOT_OPENAI_MODEL: z.string().default('gpt-5-mini'),
  COPILOT_ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
