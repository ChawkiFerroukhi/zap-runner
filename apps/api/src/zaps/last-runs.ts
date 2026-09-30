import type { ZapLastRun } from '@zap-runner/shared';
import { mongo } from 'mongoose';
import { DeliveryModel } from '../deliveries/delivery.model.js';

const LAST_RUN_STATUSES = ['queued', 'running', 'retrying', 'succeeded', 'failed'] as const;

function isLastRunStatus(value: string): value is ZapLastRun['status'] {
  return LAST_RUN_STATUSES.some((status) => status === value);
}

export async function lastRunsFor(
  userId: string,
  zapIds: string[],
): Promise<Map<string, ZapLastRun>> {
  const runs = new Map<string, ZapLastRun>();
  if (zapIds.length === 0) return runs;
  const latest = await DeliveryModel.aggregate<{
    _id: mongo.ObjectId;
    status: string;
    receivedAt: Date;
  }>([
    {
      $match: {
        userId: new mongo.ObjectId(userId),
        zapId: { $in: zapIds.map((id) => new mongo.ObjectId(id)) },
        status: { $ne: 'skipped' },
      },
    },
    { $sort: { receivedAt: -1 } },
    {
      $group: {
        _id: '$zapId',
        status: { $first: '$status' },
        receivedAt: { $first: '$receivedAt' },
      },
    },
  ]);
  for (const entry of latest) {
    if (isLastRunStatus(entry.status)) {
      runs.set(entry._id.toString(), {
        status: entry.status,
        receivedAt: entry.receivedAt.toISOString(),
      });
    }
  }
  return runs;
}
