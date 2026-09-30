import type { Request, Response } from 'express';
import type { DeliveryEvents } from './delivery-events.js';

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3_000;

export interface StreamFilter {
  userId: string;
  zapId: string | null;
}

export function streamDeliveries(
  req: Request,
  res: Response,
  events: DeliveryEvents,
  filter: StreamFilter,
): void {
  res.status(200).set({
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders();
  res.write(`retry: ${RETRY_MS}\n\n`);

  const unsubscribe = events.subscribe(({ userId, delivery }) => {
    if (userId !== filter.userId) return;
    if (filter.zapId !== null && delivery.zapId !== filter.zapId) return;
    res.write(`id: ${delivery.id}\nevent: delivery\ndata: ${JSON.stringify(delivery)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);

  function stop(): void {
    clearInterval(heartbeat);
    unsubscribe();
    stopOnClose();
  }
  const stopOnClose = events.onClose(() => {
    stop();
    res.end();
  });

  req.log.debug(filter, 'delivery stream opened');
  req.on('close', stop);
}
