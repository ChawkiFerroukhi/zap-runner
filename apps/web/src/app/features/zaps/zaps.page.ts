import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ZapDto } from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { RegistryStore } from '../../core/registry.store';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { ZapStatusBadge } from '../../ui/status-badge';
import { CopilotPanel } from './copilot-panel';
import { summarize, type ZapSummary } from './zap-summary';

interface ZapRow {
  zap: ZapDto;
  summary: ZapSummary;
  updated: string;
}

@Component({
  selector: 'app-zaps-page',
  imports: [RouterLink, ZapStatusBadge, CopilotPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Zaps</h1>
        <div class="actions">
          <a class="btn btn-primary" routerLink="/zaps/new">New Zap</a>
        </div>
      </header>

      <app-copilot-panel />

      @if (error(); as message) {
        <p class="notice notice-danger" role="alert">{{ message }}</p>
      }

      @if (rows(); as rows) {
        @if (rows.length === 0) {
          <section class="panel empty-state">
            <h2>No Zaps yet</h2>
            <p class="muted">
              A Zap pairs a trigger with an action. Start with one that comments on every pull
              request opened in a repository you administer.
            </p>
            <a class="btn btn-primary" routerLink="/zaps/new">Create a Zap</a>
          </section>
        } @else {
          <section class="panel list" aria-label="Zaps">
            <div class="list-row list-head row-grid label" aria-hidden="true">
              <span>Name</span>
              <span>Steps</span>
              <span>Repository</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            @for (row of rows; track row.zap.id) {
              <a class="list-row row-grid" [routerLink]="['/zaps', row.zap.id]">
                <span class="name truncate">{{ row.zap.name }}</span>
                <span class="steps truncate muted">
                  {{ row.summary.triggerName }}
                  <span class="arrow" aria-label="then">→</span>
                  {{ row.summary.actionName }}
                </span>
                <span class="mono truncate muted">{{ row.summary.repository }}</span>
                <span><app-zap-status [enabled]="row.zap.enabled" [draft]="row.zap.draft" /></span>
                <span class="muted">{{ row.updated }}</span>
              </a>
            }
          </section>
        }
      } @else if (!error()) {
        <section class="panel list" aria-busy="true" aria-label="Loading Zaps">
          @for (placeholder of placeholders; track placeholder) {
            <div class="list-row row-grid">
              <span class="skeleton bar"></span>
              <span class="skeleton bar"></span>
              <span class="skeleton bar short"></span>
              <span class="skeleton bar tiny"></span>
              <span class="skeleton bar tiny"></span>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .row-grid {
      grid-template-columns: minmax(160px, 1.3fr) minmax(200px, 2fr) minmax(140px, 1.2fr) 64px 96px;
    }
    .name {
      font-weight: var(--weight-medium);
    }
    .arrow {
      padding: 0 var(--space-1);
      color: var(--color-text-subtle);
    }
    .bar {
      height: 12px;
    }
    .bar.short {
      width: 70%;
    }
    .bar.tiny {
      width: 48px;
    }
  `,
})
export class ZapsPage {
  private readonly api = inject(ZapsApi);
  private readonly registry = inject(RegistryStore);
  private readonly zaps = signal<ZapDto[] | null>(null);

  protected readonly error = signal<string | null>(null);
  protected readonly placeholders = [1, 2, 3];
  protected readonly rows = computed<ZapRow[] | null>(() => {
    const zaps = this.zaps();
    if (!zaps || !this.registry.registry()) return null;
    return zaps.map((zap) => ({
      zap,
      summary: summarize(zap, this.registry),
      updated: timeAgo(zap.updatedAt),
    }));
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [zaps] = await Promise.all([this.api.list(), this.registry.load()]);
      this.zaps.set(zaps);
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
