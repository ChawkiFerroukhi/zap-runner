import { EventEmitter } from 'node:events';
import type { DeliveryDto } from '@zap-runner/shared';

export interface DeliveryChanged {
  userId: string;
  delivery: DeliveryDto;
}

export interface DeliveryEvents {
  publish(change: DeliveryChanged): void;
  subscribe(listener: (change: DeliveryChanged) => void): () => void;
  onClose(listener: () => void): () => void;
  close(): void;
}

export function createDeliveryEvents(): DeliveryEvents {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  function listen(event: string, listener: (change: DeliveryChanged) => void): () => void {
    emitter.on(event, listener);
    return () => emitter.off(event, listener);
  }

  return {
    publish: (change) => emitter.emit('change', change),
    subscribe: (listener) => listen('change', listener),
    onClose: (listener) =>
      listen('close', () => {
        listener();
      }),
    close: () => emitter.emit('close'),
  };
}
