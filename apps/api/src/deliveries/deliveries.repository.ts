import { randomUUID } from 'node:crypto';
import type {
  ConfigValues,
  DeliveryDto,
  DeliverySource,
  FieldMap,
  RunCounts,
  RunFilter,
  RunPage,
  RunRange,
} from '@zap-runner/shared';
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
  replayOf?: string;
}

export interface ClaimedDelivery {
  id: string;
  zapId: string;
  githubDeliveryId: string;
  payload: unknown;
  attempts: number;
}

export interface DeliveryOutcome {
  status: 'succeeded' | 'failed' | 'skipped' | 'retrying';
  statusReason: string | null;
  fields: FieldMap | null;
  resolvedConfig: ConfigValues | null;
  missingFields: string[];
  result: Record<string, unknown> | null;
  attempt: StoredAttempt | null;
  nextAttemptAt: Date | null;
}

export interface StoredPayload {
  event: string;
  payload: unknown;
  receivedAt: Date;
}

export interface DeliveriesRepository {
  record(delivery: NewDelivery): Promise<string | null>;
  claimNext(now: Date, leaseMs: number): Promise<ClaimedDelivery | null>;
  finish(deliveryId: string, outcome: DeliveryOutcome): Promise<void>;
  nextDueAt(): Promise<Date | null>;
  page(userId: string, zapId: string | null, query: RunQuery): Promise<RunPage>;
  payloadOf(
    userId: string,
    zapId: string,
    deliveryId: string,
  ): Promise<{ payload: unknown } | null>;
  findOwned(
    userId: string,
    deliveryId: string,
  ): Promise<(DeliveryDto & { payload: unknown }) | null>;
  replay(userId: string, deliveryId: string): Promise<string | null>;
  recentPayloads(userId: string, zapId: string, limit: number): Promise<StoredPayload[]>;
  latestFields(
    userId: string,
    zapIds: string[],
  ): Promise<{ fields: FieldMap; receivedAt: Date } | null>;
}

const PENDING: ('queued' | 'retrying')[] = ['queued', 'retrying'];

export interface RunQuery {
  filter: RunFilter;
  range: RunRange;
  cursor: string | null;
  limit: number;
}

const RANGE_MS: Record<RunRange, number | null> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  all: null,
};

type StatusFilter = { status: { $ne: 'skipped' } } | { status: Exclude<RunFilter, 'runs'> };

function statusFilter(filter: RunFilter): StatusFilter {
  return filter === 'runs' ? { status: { $ne: 'skipped' } } : { status: filter };
}

function encodeCursor(receivedAt: Date, id: string): string {
  return Buffer.from(`${receivedAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string | null): { receivedAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const receivedAt = new Date(iso ?? '');
  if (!id || !isValidObjectId(id) || Number.isNaN(receivedAt.getTime())) return null;
  return { receivedAt, id };
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

  async function record(delivery: NewDelivery): Promise<string | null> {
    try {
      const now = new Date();
      const created = await DeliveryModel.create({
        ...delivery,
        eventAction: eventActionOf(delivery.payload),
        status: 'queued',
        receivedAt: now,
        nextAttemptAt: now,
      });
      const id = created._id.toString();
      await announce(id);
      return id;
    } catch (error) {
      if (isDuplicateKey(error)) return null;
      throw error;
    }
  }

  return {
    record,

    async claimNext(now, leaseMs) {
      const delivery = await DeliveryModel.findOneAndUpdate(
        {
          $or: [
            { status: { $in: PENDING }, nextAttemptAt: { $lte: now } },
            { status: 'running', lockedUntil: { $lte: now } },
          ],
        },
        { status: 'running', lockedUntil: new Date(now.getTime() + leaseMs) },
        { sort: { nextAttemptAt: 1 }, returnDocument: 'after', lean: true },
      );
      if (!delivery) return null;
      const id = delivery._id.toString();
      await announce(id);
      return {
        id,
        zapId: delivery.zapId.toString(),
        githubDeliveryId: delivery.githubDeliveryId,
        payload: delivery.payload,
        attempts: delivery.attempts.length,
      };
    },

    async finish(deliveryId, outcome) {
      const { attempt, ...fields } = outcome;
      const final = outcome.status !== 'retrying';
      await DeliveryModel.updateOne(
        { _id: deliveryId },
        {
          $set: { ...fields, lockedUntil: null, completedAt: final ? new Date() : null },
          ...(attempt ? { $push: { attempts: attempt } } : {}),
        },
      );
      await announce(deliveryId);
    },

    async nextDueAt() {
      const [pending] = await DeliveryModel.find({ status: { $in: PENDING } }, { nextAttemptAt: 1 })
        .sort({ nextAttemptAt: 1 })
        .limit(1)
        .lean();
      const [stuck] = await DeliveryModel.find({ status: 'running' }, { lockedUntil: 1 })
        .sort({ lockedUntil: 1 })
        .limit(1)
        .lean();
      const times = [pending?.nextAttemptAt, stuck?.lockedUntil].filter(
        (time): time is Date => time instanceof Date,
      );
      return times.length > 0 ? new Date(Math.min(...times.map((time) => time.getTime()))) : null;
    },

    async page(userId, zapId, query) {
      const empty: RunCounts = { runs: 0, succeeded: 0, failed: 0, retrying: 0, skipped: 0 };
      if (zapId !== null && !isValidObjectId(zapId))
        return { items: [], nextCursor: null, counts: empty };

      const rangeMs = RANGE_MS[query.range];
      const since =
        rangeMs === null ? {} : { receivedAt: { $gte: new Date(Date.now() - rangeMs) } };
      const scope = { userId, ...(zapId === null ? {} : { zapId }), ...since };
      const matchScope = {
        userId: new mongo.ObjectId(userId),
        ...(zapId === null ? {} : { zapId: new mongo.ObjectId(zapId) }),
        ...since,
      };
      const cursor = decodeCursor(query.cursor);
      const before = cursor
        ? {
            $or: [
              { receivedAt: { $lt: cursor.receivedAt } },
              { receivedAt: cursor.receivedAt, _id: { $lt: cursor.id } },
            ],
          }
        : {};

      const [found, grouped] = await Promise.all([
        DeliveryModel.find({ ...scope, ...statusFilter(query.filter), ...before })
          .sort({ receivedAt: -1, _id: -1 })
          .limit(query.limit + 1)
          .lean(),
        DeliveryModel.aggregate<{ _id: string; count: number }>([
          { $match: matchScope },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
      ]);

      const counts = { ...empty };
      for (const { _id: status, count } of grouped) {
        if (status === 'skipped') counts.skipped += count;
        else counts.runs += count;
        if (status === 'succeeded' || status === 'failed' || status === 'retrying')
          counts[status] += count;
      }

      const page = found.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(toDeliveryDto),
        nextCursor:
          found.length > query.limit && last
            ? encodeCursor(last.receivedAt, last._id.toString())
            : null,
        counts,
      };
    },

    async payloadOf(userId, zapId, deliveryId) {
      if (!isValidObjectId(deliveryId) || !isValidObjectId(zapId)) return null;
      const delivery = await DeliveryModel.findOne(
        { _id: deliveryId, userId, zapId },
        { payload: 1 },
      ).lean();
      if (!delivery) return null;
      const payload: unknown = delivery.payload;
      return { payload };
    },

    async findOwned(userId, deliveryId) {
      if (!isValidObjectId(deliveryId)) return null;
      const delivery = await DeliveryModel.findOne({ _id: deliveryId, userId }).lean();
      return delivery ? { ...toDeliveryDto(delivery), payload: delivery.payload } : null;
    },

    async replay(userId, deliveryId) {
      if (!isValidObjectId(deliveryId)) return null;
      const original = await DeliveryModel.findOne({ _id: deliveryId, userId }).lean();
      if (!original) return null;
      return record({
        zapId: original.zapId.toString(),
        userId,
        githubDeliveryId: `replay-${randomUUID()}`,
        source: 'replay',
        event: original.event,
        payload: original.payload,
        replayOf: deliveryId,
      });
    },

    async recentPayloads(userId, zapId, limit) {
      if (!isValidObjectId(zapId)) return [];
      const recent = await DeliveryModel.find({ userId, zapId, source: 'webhook' })
        .sort({ receivedAt: -1 })
        .limit(limit)
        .lean();
      return recent.map((delivery): StoredPayload => {
        const payload: unknown = delivery.payload;
        return { event: delivery.event, payload, receivedAt: delivery.receivedAt };
      });
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
