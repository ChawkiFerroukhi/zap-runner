import type { ConfigValues, DeliveryDto, DeliverySource, FieldMap } from '@zap-runner/shared';
import { isValidObjectId, mongo } from 'mongoose';
import { toDeliveryDto, type StoredAttempt } from './delivery-mapping.js';
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
}

function eventActionOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('action' in payload)) return null;
  return typeof payload.action === 'string' ? payload.action : null;
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof mongo.MongoServerError && error.code === 11000;
}

export function createDeliveriesRepository(): DeliveriesRepository {
  return {
    async record(delivery) {
      try {
        const created = await DeliveryModel.create({
          ...delivery,
          eventAction: eventActionOf(delivery.payload),
          status: 'queued',
          receivedAt: new Date(),
        });
        return created._id.toString();
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
    },

    async listForZap(userId, zapId, limit) {
      if (!isValidObjectId(zapId)) return [];
      const deliveries = await DeliveryModel.find({ userId, zapId })
        .sort({ receivedAt: -1 })
        .limit(limit)
        .lean();
      return deliveries.map(toDeliveryDto);
    },
  };
}
