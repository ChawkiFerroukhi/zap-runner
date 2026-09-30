import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
  protected readonly zaps = signal<ZapOption[]>([]);

  constructor() {
    void this.api
      .list()
      .then((zaps) => {
        this.zaps.set(zaps.map((zap) => ({ id: zap.id, name: zap.name })));
      })
      .catch(() => undefined);
  }
}
