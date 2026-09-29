import type { ConfigValues } from '@zap-runner/shared';
import { isValidObjectId } from 'mongoose';
import { storedConfig } from './zap-mapping.js';
import { ZapModel } from './zap.model.js';

export interface RunnableZap {
  id: string;
  userId: string;
  enabled: boolean;
  trigger: { type: string; config: ConfigValues };
  action: { type: string; config: ConfigValues };
}

export interface HookedZap extends RunnableZap {
  sealedSecret: string;
}

export interface ZapLookup {
  byHookId(hookId: number): Promise<HookedZap | null>;
  byId(zapId: string): Promise<RunnableZap | null>;
  markWebhookVerified(zapId: string): Promise<void>;
}

interface LookupRecord {
  _id: { toString(): string };
  userId: { toString(): string };
  enabled: boolean;
  trigger: { type: string; config?: unknown };
  action: { type: string; config?: unknown };
}

function toRunnable(zap: LookupRecord): RunnableZap {
  return {
    id: zap._id.toString(),
    userId: zap.userId.toString(),
    enabled: zap.enabled,
    trigger: { type: zap.trigger.type, config: storedConfig(zap.trigger.config) },
    action: { type: zap.action.type, config: storedConfig(zap.action.config) },
  };
}

export function createZapLookup(): ZapLookup {
  return {
    async byHookId(hookId) {
      const zap = await ZapModel.findOne({ 'webhook.hookId': hookId }).lean();
      if (!zap?.webhook) return null;
      return { ...toRunnable(zap), sealedSecret: zap.webhook.secret };
    },

    async byId(zapId) {
      if (!isValidObjectId(zapId)) return null;
      const zap = await ZapModel.findById(zapId).lean();
      return zap ? toRunnable(zap) : null;
    },

    async markWebhookVerified(zapId) {
      await ZapModel.updateOne({ _id: zapId }, { 'webhook.verifiedAt': new Date() });
    },
  };
}
