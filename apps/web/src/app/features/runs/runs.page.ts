import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ToastService } from '../../core/toast.service';
import { ZapsApi } from '../../core/zaps.api';
import { RunsPanel, type ZapOption } from '../zaps/runs-panel';

@Component({
  selector: 'app-runs-page',
  imports: [RunsPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-runs-panel [zaps]="zaps()" />`,
})
export class RunsPage {
  private readonly api = inject(ZapsApi);
  private readonly toasts = inject(ToastService);
  protected readonly zaps = signal<ZapOption[] | null>(null);

  constructor() {
    void this.api
      .list()
      .then((zaps) => {
        this.zaps.set(zaps.map((zap) => ({ id: zap.id, name: zap.name })));
      })
      .catch((error: unknown) => {
        this.toasts.failure('Could not load your Zaps for the filter.', error);
      });
  }
}
