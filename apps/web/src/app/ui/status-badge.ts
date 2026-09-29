import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DeliveryStatus } from '@zap-runner/shared';

type Tone = 'success' | 'danger' | 'warning' | 'accent' | 'neutral';

const DELIVERY_TONES: Record<DeliveryStatus, Tone> = {
  queued: 'accent',
  running: 'accent',
  succeeded: 'success',
  failed: 'danger',
  skipped: 'neutral',
};

const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  skipped: 'Skipped',
};

@Component({
  selector: 'app-delivery-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge badge-' + tone()">{{ label() }}</span>`,
})
export class DeliveryStatusBadge {
  readonly status = input.required<DeliveryStatus>();
  protected readonly tone = computed(() => DELIVERY_TONES[this.status()]);
  protected readonly label = computed(() => DELIVERY_LABELS[this.status()]);
}

@Component({
  selector: 'app-zap-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="enabled() ? 'badge badge-success' : 'badge'">{{
    enabled() ? 'On' : 'Off'
  }}</span>`,
})
export class ZapStatusBadge {
  readonly enabled = input.required<boolean>();
}
