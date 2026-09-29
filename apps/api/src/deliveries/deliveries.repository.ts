import type { ConfigValues, DeliveryDto, DeliverySource, FieldMap } from '@zap-runner/shared';
import { isValidObjectId, mongo } from 'mongoose';
import type { DeliveryEvents } from './delivery-events.js';
import { toDeliveryDto, toFieldMap, type StoredAttempt } from './delivery-mapping.js';
import { DeliveryModel } from './delivery.model.js';

export interface NewDelivery {
  zapId: string;
  userId: string;
  githubDeliveryId: string;
  source: DeliverySource;
  event: string;
  payload: unknown;
}

export interface ClaimedDelivery {
  id: string;
  zapId: string;
  githubDeliveryId: string;
  payload: unknown;
  attempts: number;
}

export interface DeliveryOutcome {
  status: 'succeeded' | 'failed' | 'skipped';
  statusReason: string | null;
  fields: FieldMap | null;
  resolvedConfig: ConfigValues | null;
  missingFields: string[];
  result: Record<string, unknown> | null;
  attempt: StoredAttempt | null;
}

export interface DeliveriesRepository {
  record(delivery: NewDelivery): Promise<string | null>;
  claim(deliveryId: string): Promise<ClaimedDelivery | null>;
  finish(deliveryId: string, outcome: DeliveryOutcome): Promise<void>;
  listForZap(userId: string, zapId: string, limit: number): Promise<DeliveryDto[]>;
  latestFields(
    userId: string,
    zapIds: string[],
  ): Promise<{ fields: FieldMap; receivedAt: Date } | null>;
}

function eventActionOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('action' in payload)) return null;
  return typeof payload.action === 'string' ? payload.action : null;
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof mongo.MongoServerError && error.code === 11000;
}

export function createDeliveriesRepository(events?: DeliveryEvents): DeliveriesRepository {
  async function announce(deliveryId: string): Promise<void> {
    if (!events) return;
    const delivery = await DeliveryModel.findById(deliveryId).lean();
    if (delivery)
      events.publish({ userId: delivery.userId.toString(), delivery: toDeliveryDto(delivery) });
  }

  return {
    async record(delivery) {
      try {
        const created = await DeliveryModel.create({
          ...delivery,
          eventAction: eventActionOf(delivery.payload),
          status: 'queued',
          receivedAt: new Date(),
        });
        const id = created._id.toString();
        await announce(id);
        return id;
      } catch (error) {
        if (isDuplicateKey(error)) return null;
        throw error;
      }
    },

    async claim(deliveryId) {
      const delivery = await DeliveryModel.findOneAndUpdate(
        { _id: deliveryId, status: 'queued' },
        { status: 'running' },
        { returnDocument: 'after', lean: true },
      );
      if (!delivery) return null;
      await announce(deliveryId);
      return {
        id: delivery._id.toString(),
        zapId: delivery.zapId.toString(),
        githubDeliveryId: delivery.githubDeliveryId,
        payload: delivery.payload,
        attempts: delivery.attempts.length,
      };
    },

    async finish(deliveryId, outcome) {
      const { attempt, ...fields } = outcome;
      await DeliveryModel.updateOne(
        { _id: deliveryId },
        {
          $set: { ...fields, completedAt: new Date() },
          ...(attempt ? { $push: { attempts: attempt } } : {}),
        },
      );
      await announce(deliveryId);
    },

    async listForZap(userId, zapId, limit) {
      if (!isValidObjectId(zapId)) return [];
      const deliveries = await DeliveryModel.find({ userId, zapId })
        .sort({ receivedAt: -1 })
        .limit(limit)
        .lean();
      return deliveries.map(toDeliveryDto);
    },

    async latestFields(userId, zapIds) {
      if (zapIds.length === 0) return null;
      const delivery = await DeliveryModel.findOne({
        userId,
        zapId: { $in: zapIds },
        fields: { $ne: null },
      })
        .sort({ receivedAt: -1 })
        .lean();
      const fields = toFieldMap(delivery?.fields);
      return delivery && fields ? { fields, receivedAt: delivery.receivedAt } : null;
    },
  };
}
