import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { DeliveryDto } from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { DeliveryStream } from '../../core/delivery-stream';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { DeliveryStatusBadge } from '../../ui/status-badge';

const CLOCK_TICK_MS = 30_000;

function durationOf(delivery: DeliveryDto): string | null {
  const attempt = delivery.attempts.at(-1);
  if (!attempt) return null;
  const ms = new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function resultUrl(delivery: DeliveryDto): string | null {
  const url = delivery.result?.['url'];
  return typeof url === 'string' ? url : null;
}

@Component({
  selector: 'app-runs-panel',
  imports: [DeliveryStatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section" aria-labelledby="runs-title">
      <div class="section-header">
        <h2 id="runs-title">Runs</h2>
        @switch (connection()) {
          @case ('live') {
            <span class="badge badge-success" aria-live="polite">Live</span>
          }
          @case ('reconnecting') {
            <span class="badge badge-warning" aria-live="polite">Reconnecting</span>
          }
          @default {
            <span class="badge" aria-live="polite">Connecting</span>
          }
        }
      </div>

      @if (error(); as message) {
        <p class="notice notice-danger" role="alert">{{ message }}</p>
      }

      @if (deliveries(); as deliveries) {
        @if (deliveries.length === 0) {
          <div class="panel empty-state">
            <h2>No runs yet</h2>
            <p class="muted">
              @if (enabled()) {
                Open a pull request on <span class="mono">{{ repository() }}</span> and the run will
                appear here within a few seconds.
              } @else {
                Turn the Zap on to register its webhook, then open a pull request on
                <span class="mono">{{ repository() }}</span
                >.
              }
            </p>
          </div>
        } @else {
          <div class="panel list">
            @for (delivery of deliveries; track delivery.id) {
              <div class="run">
                <button
                  type="button"
                  class="list-row run-row"
                  [attr.aria-expanded]="expanded() === delivery.id"
                  (click)="toggle(delivery.id)"
                >
                  <app-delivery-status [status]="delivery.status" />
                  <span class="mono muted"
                    >{{ delivery.event
                    }}{{ delivery.eventAction ? '.' + delivery.eventAction : '' }}</span
                  >
                  <span class="truncate">{{ delivery.statusReason ?? 'Waiting to run' }}</span>
                  <span class="muted when">{{ ago(delivery.receivedAt) }}</span>
                </button>

                @if (expanded() === delivery.id) {
                  <div class="details">
                    <dl class="properties">
                      <dt>Delivery</dt>
                      <dd class="mono">{{ delivery.githubDeliveryId }}</dd>
                      <dt>Received</dt>
                      <dd>{{ delivery.receivedAt }}</dd>
                      @if (duration(delivery); as duration) {
                        <dt>Action took</dt>
                        <dd>{{ duration }}</dd>
                      }
                      <dt>Attempts</dt>
                      <dd>{{ delivery.attempts.length }}</dd>
                      @if (resultUrl(delivery); as url) {
                        <dt>Result</dt>
                        <dd>
                          <a [href]="url" target="_blank" rel="noopener">{{ url }}</a>
                        </dd>
                      }
                      @if (delivery.missingFields.length > 0) {
                        <dt>Missing fields</dt>
                        <dd class="mono warning">{{ delivery.missingFields.join(', ') }}</dd>
                      }
                    </dl>

                    @if (delivery.resolvedConfig; as config) {
                      <div class="block">
                        <p class="label">Resolved action settings</p>
                        <dl class="properties">
                          @for (entry of entries(config); track entry[0]) {
                            <dt class="mono">{{ entry[0] }}</dt>
                            <dd class="pre">{{ entry[1] }}</dd>
                          }
                        </dl>
                      </div>
                    }

                    @if (delivery.fields; as fields) {
                      <div class="block">
                        <p class="label">Trigger fields</p>
                        <dl class="properties">
                          @for (entry of entries(fields); track entry[0]) {
                            <dt class="mono">{{ entry[0] }}</dt>
                            <dd>{{ entry[1] }}</dd>
                          }
                        </dl>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      } @else if (!error()) {
        <div class="panel list" aria-busy="true" aria-label="Loading runs">
          @for (placeholder of [1, 2]; track placeholder) {
            <div class="list-row run-row">
              <span class="skeleton bar"></span>
              <span class="skeleton bar"></span>
              <span class="skeleton bar"></span>
              <span class="skeleton bar"></span>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .run + .run {
      border-top: 1px solid var(--color-border);
    }
    .run-row {
      grid-template-columns: 96px minmax(140px, 180px) 1fr 104px;
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button.run-row:hover {
      background: var(--color-surface-raised);
    }
    .when {
      text-align: right;
    }
    .details {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-4) var(--space-5);
      border-top: 1px solid var(--color-border);
      background: var(--color-surface-raised);
    }
    .block {
      display: grid;
      gap: var(--space-2);
    }
    .pre {
      white-space: pre-wrap;
    }
    .warning {
      color: var(--color-warning-fg);
    }
    .bar {
      height: 12px;
    }
  `,
})
export class RunsPanel {
  private readonly api = inject(ZapsApi);
  private readonly stream = inject(DeliveryStream);

  readonly zapId = input.required<string>();
  readonly repository = input.required<string>();
  readonly enabled = input.required<boolean>();

  protected readonly deliveries = signal<DeliveryDto[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly connection = signal<'connecting' | 'live' | 'reconnecting'>('connecting');

  protected readonly duration = durationOf;
  protected readonly resultUrl = resultUrl;

  constructor() {
    effect((onCleanup) => {
      const zapId = this.zapId();
      let dropped = false;
      const subscription = this.stream.watch(zapId).subscribe((event) => {
        if (event.kind === 'open') {
          this.connection.set('live');
          if (dropped || this.deliveries() === null) void this.refresh(zapId);
          dropped = false;
        } else if (event.kind === 'reconnecting') {
          this.connection.set('reconnecting');
          dropped = true;
        } else {
          this.upsert(event.delivery);
        }
      });
      onCleanup(() => {
        subscription.unsubscribe();
      });
    });
    const clock = setInterval(() => {
      this.now.set(Date.now());
    }, CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
    });
  }

  private upsert(delivery: DeliveryDto): void {
    this.now.set(Date.now());
    this.deliveries.update((current) => {
      const list = current ?? [];
      const index = list.findIndex((item) => item.id === delivery.id);
      if (index === -1) return [delivery, ...list];
      return list.map((item) => (item.id === delivery.id ? delivery : item));
    });
  }

  protected ago(iso: string): string {
    return timeAgo(iso, this.now());
  }

  protected entries(values: Record<string, unknown>): [string, string][] {
    return Object.entries(values).map(([key, value]) => [key, String(value)]);
  }

  protected toggle(deliveryId: string): void {
    this.expanded.update((current) => (current === deliveryId ? null : deliveryId));
  }

  private async refresh(zapId: string): Promise<void> {
    try {
      this.deliveries.set(await this.api.deliveries(zapId));
      this.now.set(Date.now());
      this.error.set(null);
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
