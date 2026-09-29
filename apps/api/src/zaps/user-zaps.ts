import type { ZapDto, ZapInput } from '@zap-runner/shared';
import { isValidObjectId } from 'mongoose';
import { toZapDto, type StoredWebhook } from './zap-mapping.js';
import { ZapModel } from './zap.model.js';

export interface UserZaps {
  list(): Promise<ZapDto[]>;
  get(zapId: string): Promise<ZapDto | null>;
  create(input: ZapInput): Promise<ZapDto>;
  update(zapId: string, input: ZapInput): Promise<ZapDto | null>;
  setSubscription(zapId: string, webhook: StoredWebhook | null): Promise<ZapDto | null>;
  remove(zapId: string): Promise<boolean>;
}

export function userZaps(userId: string): UserZaps {
  const owned = (zapId: string) => ({ _id: zapId, userId });

  return {
    async list() {
      const zaps = await ZapModel.find({ userId }).sort({ updatedAt: -1 }).lean();
      return zaps.map(toZapDto);
    },

    async get(zapId) {
      if (!isValidObjectId(zapId)) return null;
      const zap = await ZapModel.findOne(owned(zapId)).lean();
      return zap ? toZapDto(zap) : null;
    },

    async create(input) {
      const zap = await ZapModel.create({ ...input, userId, enabled: false, webhook: null });
      return toZapDto(zap.toObject());
    },

    async update(zapId, input) {
      if (!isValidObjectId(zapId)) return null;
      const zap = await ZapModel.findOneAndUpdate(
        owned(zapId),
        { name: input.name, trigger: input.trigger, action: input.action },
        { returnDocument: 'after', lean: true },
      );
      return zap ? toZapDto(zap) : null;
    },

    async setSubscription(zapId, webhook) {
      if (!isValidObjectId(zapId)) return null;
      const zap = await ZapModel.findOneAndUpdate(
        owned(zapId),
        { enabled: webhook !== null, webhook },
        { returnDocument: 'after', lean: true },
      );
      return zap ? toZapDto(zap) : null;
    },

    async remove(zapId) {
      if (!isValidObjectId(zapId)) return false;
      const result = await ZapModel.deleteOne(owned(zapId));
      return result.deletedCount === 1;
    },
  };
}
