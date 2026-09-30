import { Injectable } from '@angular/core';
import type { DeliveryDto } from '@zap-runner/shared';
import { Observable } from 'rxjs';

export type StreamEvent =
  { kind: 'open' } | { kind: 'reconnecting' } | { kind: 'delivery'; delivery: DeliveryDto };

function isDelivery(value: unknown): value is DeliveryDto {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'status' in value &&
    typeof value.status === 'string'
  );
}

@Injectable({ providedIn: 'root' })
export class DeliveryStream {
  watch(zapId: string | null): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      const source = new EventSource(zapId ? `/api/zaps/${zapId}/events` : '/api/runs/events');
      source.onopen = () => {
        subscriber.next({ kind: 'open' });
      };
      source.onerror = () => {
        subscriber.next({ kind: 'reconnecting' });
      };
      source.addEventListener('delivery', (event) => {
        const data: unknown = JSON.parse(String(event.data));
        if (isDelivery(data)) subscriber.next({ kind: 'delivery', delivery: data });
      });
      return () => {
        source.close();
      };
    });
  }
}
