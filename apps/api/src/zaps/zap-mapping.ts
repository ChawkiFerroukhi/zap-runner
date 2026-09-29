import { configValuesSchema, type ConfigValues, type ZapDto } from '@zap-runner/shared';

export interface StoredWebhook {
  hookId: number;
  secret: string;
  repository: string;
  verifiedAt?: Date | null | undefined;
}

export interface StoredZap {
  _id: { toString(): string };
  userId: { toString(): string };
  name: string;
  enabled: boolean;
  draft?: boolean | null | undefined;
  trigger: { type: string; config?: unknown };
  action: { type: string; config?: unknown };
  webhook?: StoredWebhook | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export function storedConfig(config: unknown): ConfigValues {
  return configValuesSchema.parse(config ?? {});
}

export function toZapDto(zap: StoredZap): ZapDto {
  return {
    id: zap._id.toString(),
    name: zap.name,
    enabled: zap.enabled,
    draft: zap.draft ?? false,
    trigger: { type: zap.trigger.type, config: storedConfig(zap.trigger.config) },
    action: { type: zap.action.type, config: storedConfig(zap.action.config) },
    webhook: zap.webhook
      ? {
          hookId: zap.webhook.hookId,
          repository: zap.webhook.repository,
          verifiedAt: zap.webhook.verifiedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: zap.createdAt.toISOString(),
    updatedAt: zap.updatedAt.toISOString(),
  };
}
