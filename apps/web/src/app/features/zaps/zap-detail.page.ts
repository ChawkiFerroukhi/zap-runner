import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ZapDto } from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { RegistryStore } from '../../core/registry.store';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { ZapStatusBadge } from '../../ui/status-badge';
import { RunsPanel } from './runs-panel';
import { monogram, summarize } from './zap-summary';

@Component({
  selector: 'app-zap-detail-page',
  imports: [RouterLink, ZapStatusBadge, RunsPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a class="breadcrumb" routerLink="/zaps">Zaps</a>

      @if (error(); as message) {
        <p class="notice notice-danger" role="alert">{{ message }}</p>
      }

      @if (view(); as view) {
        <header class="page-header">
          <div class="title">
            <h1 class="truncate">{{ view.zap.name }}</h1>
            <app-zap-status [enabled]="view.zap.enabled" [draft]="view.zap.draft" />
          </div>
          <div class="actions">
            @if (confirmingDelete()) {
              <span class="muted confirm">Delete this Zap and its webhook?</span>
              <button type="button" class="btn" (click)="confirmingDelete.set(false)">
                Cancel
              </button>
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove()">
                Delete
              </button>
            } @else {
              <button type="button" class="btn btn-ghost" (click)="confirmingDelete.set(true)">
                Delete
              </button>
              @if (view.zap.draft) {
                <a class="btn btn-primary" [routerLink]="['/zaps', view.zap.id, 'edit']"
                  >Finish draft</a
                >
              } @else {
                <a class="btn" [routerLink]="['/zaps', view.zap.id, 'edit']">Edit</a>
                <button
                  type="button"
                  [class]="view.zap.enabled ? 'btn' : 'btn btn-primary'"
                  [disabled]="busy()"
                  (click)="toggle(view.zap)"
                >
                  {{ busy() ? 'Working…' : view.zap.enabled ? 'Turn off' : 'Turn on' }}
                </button>
              }
            }
          </div>
        </header>

        @if (view.zap.draft) {
          <p class="notice notice-warning" role="status">
            This Zap is a draft. Open it, check each setting and click Save to finish it. Drafts
            cannot be turned on.
          </p>
        }

        <div class="steps">
          <section class="panel step" aria-labelledby="trigger-title">
            <p class="label">Trigger</p>
            <div class="step-title">
              <span class="monogram" aria-hidden="true">{{
                monogram(view.summary.triggerApp)
              }}</span>
              <h2 id="trigger-title">{{ view.summary.triggerName }}</h2>
            </div>
            <dl class="properties">
              <dt>App</dt>
              <dd>{{ view.summary.triggerApp }}</dd>
              <dt>Repository</dt>
              <dd class="mono">{{ view.summary.repository }}</dd>
              <dt>Webhook</dt>
              <dd>
                @if (view.zap.webhook; as webhook) {
                  @if (webhook.verifiedAt) {
                    <span class="badge badge-success">Verified</span>
                    <span class="muted"> GitHub confirmed it {{ ago(webhook.verifiedAt) }}</span>
                  } @else {
                    <span class="badge badge-warning">Awaiting ping</span>
                  }
                } @else {
                  <span class="muted">Not registered. Turn the Zap on to create it.</span>
                }
              </dd>
            </dl>
          </section>

          <section class="panel step" aria-labelledby="action-title">
            <p class="label">Action</p>
            <div class="step-title">
              <span class="monogram" aria-hidden="true">{{
                monogram(view.summary.actionApp)
              }}</span>
              <h2 id="action-title">{{ view.summary.actionName }}</h2>
            </div>
            <dl class="properties">
              @for (field of view.actionFields; track field.key) {
                <dt>{{ field.label }}</dt>
                <dd class="mono pre">{{ field.value }}</dd>
              }
            </dl>
          </section>
        </div>

        <app-runs-panel
          [zapId]="view.zap.id"
          [repository]="view.summary.repository"
          [enabled]="view.zap.enabled"
        />
      } @else if (!error()) {
        <div class="steps" aria-busy="true" aria-label="Loading Zap">
          <div class="panel step"><span class="skeleton block"></span></div>
          <div class="panel step"><span class="skeleton block"></span></div>
        </div>
      }
    </div>
  `,
  styles: `
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: var(--space-4);
    }
    .step {
      display: grid;
      align-content: start;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5) var(--space-5);
    }
    .step-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .pre {
      white-space: pre-wrap;
    }
    .confirm {
      align-self: center;
      font-size: var(--text-xs);
    }
    .block {
      display: block;
      height: 120px;
    }
  `,
})
export class ZapDetailPage {
  private readonly api = inject(ZapsApi);
  private readonly registry = inject(RegistryStore);
  private readonly router = inject(Router);

  readonly zapId = input.required<string>();

  private readonly zap = signal<ZapDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly monogram = monogram;

  protected readonly view = computed(() => {
    const zap = this.zap();
    if (!zap || !this.registry.registry()) return null;
    const action = this.registry.action(zap.action.type);
    return {
      zap,
      summary: summarize(zap, this.registry),
      actionFields: (action?.configFields ?? []).map((field) => ({
        key: field.key,
        label: field.label,
        value: String(zap.action.config[field.key] ?? ''),
      })),
    };
  });

  constructor() {
    effect(() => {
      void this.load(this.zapId());
    });
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected async toggle(zap: ZapDto): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.zap.set(await this.api.setEnabled(zap.id, !zap.enabled));
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.remove(this.zapId());
      await this.router.navigateByUrl('/zaps');
    } catch (error) {
      this.error.set(toApiError(error).message);
      this.busy.set(false);
    }
  }

  private async load(zapId: string): Promise<void> {
    try {
      const [zap] = await Promise.all([this.api.get(zapId), this.registry.load()]);
      this.zap.set(zap);
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
