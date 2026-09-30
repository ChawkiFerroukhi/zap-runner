import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type {
  DeliveryAttempt,
  DeliveryDto,
  RunCounts,
  RunFilter,
  RunPage,
  RunRange,
} from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { DeliveryStream } from '../../core/delivery-stream';
import { highlightJson, type JsonSegment } from '../../core/json-highlight';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { DeliveryStatusBadge } from '../../ui/status-badge';

const CLOCK_TICK_MS = 30_000;
const COUNTS_DEBOUNCE_MS = 400;

const FILTERS: { id: RunFilter; label: string }[] = [
  { id: 'runs', label: 'All runs' },
  { id: 'succeeded', label: 'Succeeded' },
  { id: 'failed', label: 'Failed' },
  { id: 'retrying', label: 'Retrying' },
  { id: 'skipped', label: 'Skipped events' },
];

const RANGES: { id: RunRange; label: string; ms: number | null }[] = [
  { id: '24h', label: '24h', ms: 86_400_000 },
  { id: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { id: '30d', label: '30 days', ms: 30 * 86_400_000 },
  { id: 'all', label: 'All time', ms: null },
];

const EMPTY_COUNTS: RunCounts = { runs: 0, succeeded: 0, failed: 0, retrying: 0, skipped: 0 };

export interface ZapOption {
  id: string;
  name: string;
}

interface AttemptRow {
  number: string;
  outcome: string;
  succeeded: boolean;
  duration: string;
  error: string;
  next: string;
}

function matchesFilter(delivery: DeliveryDto, filter: RunFilter): boolean {
  return filter === 'runs' ? delivery.status !== 'skipped' : delivery.status === filter;
}

function durationOf(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return ms < 1000 ? `${String(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function secondsBetween(from: string, to: string): string {
  const seconds = Math.max(
    0,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000),
  );
  return seconds < 60 ? `${String(seconds)} s` : `${String(Math.round(seconds / 60))} min`;
}

function resultUrl(delivery: DeliveryDto): string | null {
  const url = delivery.result?.['url'];
  return typeof url === 'string' ? url : null;
}

@Component({
  selector: 'app-runs-panel',
  imports: [DeliveryStatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './runs-panel.html',
  styleUrl: './runs-panel.css',
})
export class RunsPanel {
  private readonly api = inject(ZapsApi);
  private readonly stream = inject(DeliveryStream);

  readonly zapId = input<string | null>(null);
  readonly repository = input('');
  readonly enabled = input(false);
  readonly zaps = input<ZapOption[]>([]);

  protected readonly filters = FILTERS;
  protected readonly ranges = RANGES;
  protected readonly filter = signal<RunFilter>('runs');
  protected readonly range = signal<RunRange>('7d');
  protected readonly zapFilter = signal<string | null>(null);
  protected readonly items = signal<DeliveryDto[] | null>(null);
  protected readonly counts = signal<RunCounts>(EMPTY_COUNTS);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly connection = signal<'connecting' | 'live' | 'reconnecting'>('connecting');
  protected readonly replaying = signal<string | null>(null);
  protected readonly payloads = signal<Record<string, { text: string; lines: JsonSegment[][] }>>(
    {},
  );
  protected readonly payloadOpen = signal<Record<string, boolean>>({});
  protected readonly copied = signal<string | null>(null);

  protected readonly global = computed(() => this.zapId() === null);
  protected readonly zapNames = computed(
    () => new Map(this.zaps().map((zap) => [zap.id, zap.name])),
  );
  protected readonly resultUrl = resultUrl;

  private countsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const zapId = this.zapId();
      const filter = this.filter();
      const range = this.range();
      const zapFilter = this.zapFilter();
      untracked(() => {
        void this.reload(zapId, filter, range, zapFilter);
      });
    });

    effect((onCleanup) => {
      const zapId = this.zapId();
      let dropped = false;
      const subscription = this.stream.watch(zapId).subscribe((event) => {
        if (event.kind === 'open') {
          this.connection.set('live');
          if (dropped) void this.reload(zapId, this.filter(), this.range(), this.zapFilter());
          dropped = false;
        } else if (event.kind === 'reconnecting') {
          this.connection.set('reconnecting');
          dropped = true;
        } else {
          this.merge(event.delivery);
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
      if (this.countsTimer) clearTimeout(this.countsTimer);
    });
  }

  protected ago(iso: string): string {
    return timeAgo(iso, this.now());
  }

  protected entries(values: Record<string, unknown>): [string, string][] {
    return Object.entries(values).map(([key, value]) => [key, String(value)]);
  }

  protected countFor(filter: RunFilter): number {
    return this.counts()[filter];
  }

  protected zapNameOf(delivery: DeliveryDto): string {
    return this.zapNames().get(delivery.zapId) ?? 'Deleted Zap';
  }

  protected setZapFilter(event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      this.expanded.set(null);
      this.zapFilter.set(event.target.value === '' ? null : event.target.value);
    }
  }

  protected toggle(deliveryId: string): void {
    this.expanded.update((current) => (current === deliveryId ? null : deliveryId));
  }

  protected attemptsOf(delivery: DeliveryDto): AttemptRow[] {
    const attempts: DeliveryAttempt[] = delivery.attempts;
    return attempts.map((attempt, index) => {
      const next = attempts[index + 1];
      const last = index === attempts.length - 1;
      let note: string;
      if (attempt.outcome === 'succeeded')
        note = last ? (delivery.statusReason ?? 'Succeeded') : '';
      else if (next) note = `Retried after ${secondsBetween(attempt.finishedAt, next.startedAt)}`;
      else if (delivery.status === 'retrying' && delivery.nextAttemptAt) {
        note = `Next retry ${timeAgo(delivery.nextAttemptAt, this.now())}`;
      } else note = attempt.retryable ? 'No retries left' : 'Not retried: error is not retryable';
      return {
        number: `#${String(attempt.number)}`,
        outcome: attempt.outcome,
        succeeded: attempt.outcome === 'succeeded',
        duration: durationOf(attempt.startedAt, attempt.finishedAt),
        error: attempt.error ?? '',
        next: note,
      };
    });
  }

  protected async loadOlder(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    this.loadingMore.set(true);
    try {
      const page = await this.fetch(
        this.zapId(),
        this.filter(),
        this.range(),
        this.zapFilter(),
        cursor,
      );
      this.items.update((current) => [...(current ?? []), ...page.items]);
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected async togglePayload(delivery: DeliveryDto): Promise<void> {
    const open = !this.payloadOpen()[delivery.id];
    this.payloadOpen.update((current) => ({ ...current, [delivery.id]: open }));
    if (!open || this.payloads()[delivery.id]) return;
    try {
      const { payload } = await this.api.payload(delivery.zapId, delivery.id);
      const text = JSON.stringify(payload, null, 2);
      this.payloads.update((current) => ({
        ...current,
        [delivery.id]: { text, lines: highlightJson(text) },
      }));
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }

  protected async copyPayload(deliveryId: string): Promise<void> {
    const payload = this.payloads()[deliveryId];
    if (!payload) return;
    await navigator.clipboard.writeText(payload.text);
    this.copied.set(deliveryId);
    setTimeout(() => {
      this.copied.set(null);
    }, 1500);
  }

  protected async replay(delivery: DeliveryDto): Promise<void> {
    this.replaying.set(delivery.id);
    this.error.set(null);
    try {
      const { deliveryId } = await this.api.replay(delivery.zapId, delivery.id);
      this.expanded.set(deliveryId);
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.replaying.set(null);
    }
  }

  private fetch(
    zapId: string | null,
    filter: RunFilter,
    range: RunRange,
    zapFilter: string | null,
    cursor: string | null = null,
    limit?: number,
  ): Promise<RunPage> {
    const extra = limit === undefined ? {} : { limit };
    return zapId
      ? this.api.runs(zapId, { filter, range, cursor, ...extra })
      : this.api.allRuns({ filter, range, zapId: zapFilter, cursor, ...extra });
  }

  private async reload(
    zapId: string | null,
    filter: RunFilter,
    range: RunRange,
    zapFilter: string | null,
  ): Promise<void> {
    try {
      const page = await this.fetch(zapId, filter, range, zapFilter);
      const stale =
        zapId !== this.zapId() ||
        filter !== this.filter() ||
        range !== this.range() ||
        zapFilter !== this.zapFilter();
      if (stale) return;
      this.items.set(page.items);
      this.counts.set(page.counts);
      this.nextCursor.set(page.nextCursor);
      this.now.set(Date.now());
      this.error.set(null);
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }

  private merge(delivery: DeliveryDto): void {
    this.now.set(Date.now());
    const zapFilter = this.zapFilter();
    const inScope = zapFilter === null || delivery.zapId === zapFilter;
    const matches =
      inScope && this.withinRange(delivery.receivedAt) && matchesFilter(delivery, this.filter());
    this.items.update((current) => {
      const list = current ?? [];
      const index = list.findIndex((item) => item.id === delivery.id);
      if (!matches) return index === -1 ? list : list.filter((item) => item.id !== delivery.id);
      if (index === -1) return [delivery, ...list];
      return list.map((item) => (item.id === delivery.id ? delivery : item));
    });
    this.refreshCountsSoon();
  }

  private withinRange(receivedAt: string): boolean {
    const ms = RANGES.find((range) => range.id === this.range())?.ms ?? null;
    return ms === null || Date.now() - new Date(receivedAt).getTime() <= ms;
  }

  private refreshCountsSoon(): void {
    if (this.countsTimer) clearTimeout(this.countsTimer);
    this.countsTimer = setTimeout(() => {
      this.countsTimer = null;
      void this.fetch(this.zapId(), this.filter(), this.range(), this.zapFilter(), null, 1)
        .then((page) => {
          this.counts.set(page.counts);
        })
        .catch(() => undefined);
    }, COUNTS_DEBOUNCE_MS);
  }
}
