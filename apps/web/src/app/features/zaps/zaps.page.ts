import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ZapDto, ZapLastRun } from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { CopilotDrafts } from '../../core/copilot-drafts';
import { RegistryStore } from '../../core/registry.store';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { ZapStatusBadge } from '../../ui/status-badge';
import { summarize, type ZapSummary } from './zap-summary';

interface ZapRow {
  zap: ZapDto;
  summary: ZapSummary;
  updated: string;
  lastRun: { label: string; tone: string; when: string } | null;
}

const LAST_RUN_LABELS: Record<ZapLastRun['status'], [string, string]> = {
  queued: ['Queued', 'accent'],
  running: ['Running', 'accent'],
  retrying: ['Retrying', 'warning'],
  succeeded: ['Succeeded', 'success'],
  failed: ['Failed', 'danger'],
};

const SKELETON_WIDTHS: [string, string][] = [
  ['58%', '72%'],
  ['44%', '64%'],
  ['66%', '80%'],
  ['50%', '68%'],
  ['62%', '76%'],
  ['40%', '60%'],
];

@Component({
  selector: 'app-zaps-page',
  imports: [ZapStatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Zaps</h1>
        <button type="button" class="btn btn-primary" (click)="drafts.openNew()">New Zap</button>
      </header>

      @if (error(); as message) {
        <p class="notice notice-danger" role="alert">{{ message }}</p>
      }

      <div
        class="panel table"
        aria-label="Zaps"
        [attr.aria-busy]="rows() === null && !error() ? true : null"
      >
        @if (rows(); as rows) {
          @if (rows.length === 0) {
            <div class="empty-state">
              <p>No Zaps yet. Create one to connect a trigger to an action.</p>
              <button type="button" class="btn btn-primary" (click)="drafts.openNew()">
                New Zap
              </button>
            </div>
          } @else {
            <div class="grid head" aria-hidden="true">
              <div>Name</div>
              <div>Trigger → Action</div>
              <div>Repository</div>
              <div>Last run</div>
              <div>Status</div>
              <div>Updated</div>
              <div></div>
            </div>
            @for (row of rows; track row.zap.id) {
              <div
                class="grid row"
                role="link"
                tabindex="0"
                [attr.aria-label]="'Open ' + row.zap.name"
                (click)="open(row.zap.id)"
                (keydown.enter)="open(row.zap.id)"
                (keydown.space)="$event.preventDefault(); open(row.zap.id)"
              >
                <div class="name truncate">{{ row.zap.name }}</div>
                <div class="steps">
                  <span class="truncate">{{ row.summary.triggerName }}</span>
                  <span class="then"
                    ><span class="arrow">→</span
                    ><span class="truncate">{{ row.summary.actionName }}</span></span
                  >
                </div>
                <div class="repo truncate">{{ row.summary.repository }}</div>
                <div class="last-run">
                  @if (row.lastRun; as lastRun) {
                    <span class="last-label" [attr.data-tone]="lastRun.tone">{{
                      lastRun.label
                    }}</span>
                    <span class="subtle">{{ lastRun.when }}</span>
                  } @else {
                    <span class="subtle">—</span>
                  }
                </div>
                <div><app-zap-status [enabled]="row.zap.enabled" [draft]="row.zap.draft" /></div>
                <div class="updated">{{ row.updated }}</div>
                <span class="chevron" aria-hidden="true"></span>
              </div>
            }
          }
        } @else if (!error()) {
          <div class="grid head" aria-hidden="true">
            <div>Name</div>
            <div>Trigger → Action</div>
            <div>Repository</div>
            <div>Last run</div>
            <div>Status</div>
            <div>Updated</div>
            <div></div>
          </div>
          @for (widths of skeletons; track $index) {
            <div class="grid row skeleton-row" aria-hidden="true">
              <span class="skeleton bar" [style.width]="widths[0]"></span>
              <span class="skeleton bar" [style.width]="widths[1]"></span>
              <span class="skeleton bar" style="width: 70%"></span>
              <span class="skeleton bar" style="width: 60%"></span>
              <span class="skeleton pill"></span>
              <span class="skeleton bar" style="width: 70%"></span>
              <span></span>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .table {
      overflow: hidden;
    }
    .grid {
      display: grid;
      grid-template-columns:
        minmax(230px, 1.4fr) minmax(0, 1.5fr) minmax(0, 1.3fr)
        140px 76px 92px 12px;
      align-items: center;
      gap: 16px;
      padding: 0 20px;
    }
    .head {
      height: 40px;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text-subtle);
      font-size: var(--text-2xs);
      font-weight: var(--weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .row {
      height: 52px;
      border-bottom: 1px solid var(--color-divider);
      cursor: pointer;
      outline: none;
    }
    .row:last-child {
      border-bottom: 0;
    }
    .row:hover,
    .row:focus-visible {
      background: var(--color-hover);
    }
    .row:focus-visible {
      box-shadow: inset 0 0 0 2px var(--color-accent);
    }
    .name {
      color: var(--color-text);
      font-weight: var(--weight-medium);
    }
    .row:hover .name {
      color: var(--color-text-strong);
    }
    .steps {
      display: flex;
      flex-direction: column;
      min-width: 0;
      color: var(--color-text-muted);
      line-height: 18px;
    }
    .row:hover .steps {
      color: var(--color-text);
    }
    .then {
      display: flex;
      gap: 6px;
      min-width: 0;
      font-size: var(--text-sm);
    }
    .arrow {
      flex: none;
      color: var(--color-text-subtle);
    }
    .repo {
      color: var(--color-text-subtle);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
    }
    .last-run {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: var(--text-sm);
      white-space: nowrap;
    }
    .last-label {
      font-weight: var(--weight-medium);
    }
    .last-label[data-tone='success'] {
      color: var(--color-success-fg);
    }
    .last-label[data-tone='danger'] {
      color: var(--color-danger-fg);
    }
    .last-label[data-tone='warning'] {
      color: var(--color-warning-fg);
    }
    .last-label[data-tone='accent'] {
      color: var(--color-accent-text);
    }
    .updated {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      white-space: nowrap;
    }
    .chevron {
      opacity: 0;
    }
    .row:hover .chevron,
    .row:focus-visible .chevron {
      opacity: 1;
    }
    .skeleton-row {
      cursor: default;
    }
    .skeleton-row:hover {
      background: transparent;
    }
    .bar {
      height: 10px;
    }
    .pill {
      width: 48px;
      height: 22px;
      border-radius: var(--radius-sm);
    }
  `,
})
export class ZapsPage {
  private readonly api = inject(ZapsApi);
  private readonly registry = inject(RegistryStore);
  private readonly router = inject(Router);
  protected readonly drafts = inject(CopilotDrafts);
  private readonly zaps = signal<ZapDto[] | null>(null);

  protected readonly error = signal<string | null>(null);
  protected readonly skeletons = SKELETON_WIDTHS;
  protected readonly rows = computed<ZapRow[] | null>(() => {
    const zaps = this.zaps();
    if (!zaps || !this.registry.registry()) return null;
    return zaps.map((zap) => {
      const lastRun = zap.lastRun ? LAST_RUN_LABELS[zap.lastRun.status] : null;
      return {
        zap,
        summary: summarize(zap, this.registry),
        updated: timeAgo(zap.updatedAt),
        lastRun:
          lastRun && zap.lastRun
            ? { label: lastRun[0], tone: lastRun[1], when: timeAgo(zap.lastRun.receivedAt) }
            : null,
      };
    });
  });

  constructor() {
    void this.load();
  }

  protected open(zapId: string): void {
    void this.router.navigate(['/zaps', zapId]);
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
