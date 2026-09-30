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
import type { TestRunResult, ZapDto } from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { RegistryStore } from '../../core/registry.store';
import { timeAgo } from '../../core/time';
import { ZapsApi } from '../../core/zaps.api';
import { ZapStatusBadge } from '../../ui/status-badge';
import { TokenText } from '../../ui/token-text';
import { RunsPanel } from './runs-panel';
import { monogram, summarize } from './zap-summary';

interface ActionDefinitionRow {
  key: string;
  label: string;
  template: string;
  resolved: string | null;
}

@Component({
  selector: 'app-zap-detail-page',
  imports: [RouterLink, ZapStatusBadge, RunsPanel, TokenText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './zap-detail.page.html',
  styleUrl: './zap-detail.page.css',
})
export class ZapDetailPage {
  private readonly api = inject(ZapsApi);
  private readonly registry = inject(RegistryStore);
  private readonly router = inject(Router);

  readonly zapId = input.required<string>();

  private readonly zap = signal<ZapDto | null>(null);
  private readonly resolution = signal<TestRunResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly testing = signal(false);
  protected readonly testResult = signal<TestRunResult | null>(null);
  protected readonly monogram = monogram;

  protected readonly view = computed(() => {
    const zap = this.zap();
    if (!zap || !this.registry.registry()) return null;
    const action = this.registry.action(zap.action.type);
    const resolution = this.resolution();
    const resolved = resolution?.trigger.matched ? resolution.resolvedConfig : null;
    const definitions: ActionDefinitionRow[] = (action?.configFields ?? []).map((field) => {
      const template = zap.action.config[field.key];
      const value = resolved?.[field.key];
      return {
        key: field.key,
        label: field.label,
        template: String(template ?? ''),
        resolved: value === undefined ? null : String(value) || 'Empty',
      };
    });
    return { zap, summary: summarize(zap, this.registry), definitions };
  });

  protected readonly resolvedNote = computed(() => {
    const resolution = this.resolution();
    if (!resolution?.trigger.matched) return null;
    if (resolution.source === 'sample' || !resolution.receivedAt)
      return 'Resolved with sample data';
    const subject = resolution.subject?.label ?? 'the latest event';
    return `Resolved with ${subject}, ${timeAgo(resolution.receivedAt)}`;
  });

  constructor() {
    effect(() => {
      void this.load(this.zapId());
    });
  }

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected hookUrl(repository: string, hookId: number): string {
    return `https://github.com/${repository}/settings/hooks/${String(hookId)}`;
  }

  protected entries(values: Record<string, unknown>): [string, string][] {
    return Object.entries(values).map(([key, value]) => [key, String(value)]);
  }

  protected async runTest(zapId: string): Promise<void> {
    this.testing.set(true);
    this.error.set(null);
    try {
      this.testResult.set(await this.api.testRun(zapId));
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.testing.set(false);
    }
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
      this.resolution.set(await this.api.testRun(zapId).catch(() => null));
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
