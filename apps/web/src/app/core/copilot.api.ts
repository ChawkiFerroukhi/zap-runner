import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CopilotDraftInput,
  CopilotEvent,
  CopilotProviderId,
  CopilotStatus,
} from '@zap-runner/shared';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CopilotApi {
  private readonly http = inject(HttpClient);

  status(): Promise<CopilotStatus> {
    return firstValueFrom(this.http.get<CopilotStatus>('/api/copilot/status'));
  }

  saveKey(provider: CopilotProviderId, apiKey: string): Promise<CopilotStatus> {
    return firstValueFrom(this.http.put<CopilotStatus>('/api/copilot/key', { provider, apiKey }));
  }

  removeKey(): Promise<CopilotStatus> {
    return firstValueFrom(this.http.delete<CopilotStatus>('/api/copilot/key'));
  }

  draft(input: CopilotDraftInput): Observable<CopilotEvent> {
    return new Observable<CopilotEvent>((subscriber) => {
      const controller = new AbortController();
      void streamDraft(input, controller.signal, (event) => {
        subscriber.next(event);
      })
        .then(() => {
          subscriber.complete();
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            subscriber.next({
              type: 'failed',
              code: 'network',
              message: 'Lost the connection while drafting.',
            });
            subscriber.complete();
          }
          return error;
        });
      return () => {
        controller.abort();
      };
    });
  }
}

function isEvent(value: unknown): value is CopilotEvent {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function errorEvent(body: unknown): CopilotEvent {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body;
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
      return { type: 'failed', code, message: error.message };
    }
  }
  return { type: 'failed', code: 'unknown', message: 'The Copilot could not start.' };
}

async function streamDraft(
  input: CopilotDraftInput,
  signal: AbortSignal,
  onEvent: (event: CopilotEvent) => void,
): Promise<void> {
  const response = await fetch('/api/copilot/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    onEvent(errorEvent(body));
    return;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split('\n').find((line) => line.startsWith('data: '));
      if (!data) continue;
      const parsed: unknown = JSON.parse(data.slice('data: '.length));
      if (isEvent(parsed)) onEvent(parsed);
    }
  }
}
