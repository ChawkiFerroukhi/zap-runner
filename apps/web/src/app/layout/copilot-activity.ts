import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CopilotDrafts } from '../core/copilot-drafts';

@Component({
  selector: 'app-copilot-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside class="activity panel" role="status" aria-live="polite" aria-label="Copilot draft">
        <div class="text">
          <p class="label">Copilot</p>
          <p class="headline">{{ headline() }}</p>
          <p class="detail muted">{{ detail() }}</p>
        </div>
        @if (drafts.phase() === 'working') {
          <div class="progress" aria-hidden="true">
            <div class="progress-fill" [style.width.%]="drafts.percent()"></div>
          </div>
        }
        <div class="actions">
          @switch (drafts.phase()) {
            @case ('working') {
              <button type="button" class="btn btn-ghost btn-sm" (click)="drafts.cancel()">
                Cancel
              </button>
              <button type="button" class="btn btn-sm" (click)="drafts.reopen()">
                Show progress
              </button>
            }
            @case ('finalizing') {
              <button type="button" class="btn btn-primary btn-sm" (click)="drafts.review()">
                Review
              </button>
            }
            @case ('ready') {
              <button type="button" class="btn btn-ghost btn-sm" (click)="drafts.dismiss()">
                Dismiss
              </button>
              <button type="button" class="btn btn-primary btn-sm" (click)="drafts.review()">
                Review
              </button>
            }
            @case ('question') {
              <button type="button" class="btn btn-ghost btn-sm" (click)="drafts.dismiss()">
                Dismiss
              </button>
              <button type="button" class="btn btn-primary btn-sm" (click)="drafts.reopen()">
                Answer
              </button>
            }
            @default {
              <button type="button" class="btn btn-ghost btn-sm" (click)="drafts.dismiss()">
                Dismiss
              </button>
              <button type="button" class="btn btn-sm" (click)="drafts.reopen()">Details</button>
            }
          }
        </div>
      </aside>
    }
  `,
  styles: `
    .activity {
      position: fixed;
      right: var(--space-5);
      bottom: var(--space-5);
      z-index: 10;
      display: grid;
      gap: var(--space-3);
      width: 320px;
      padding: var(--space-4);
      box-shadow: var(--shadow-md);
    }
    .text {
      display: grid;
      gap: 2px;
    }
    .headline {
      font-weight: var(--weight-medium);
    }
    .detail {
      overflow: hidden;
      font-size: var(--text-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .progress {
      height: 3px;
      overflow: hidden;
      border-radius: 2px;
      background: var(--color-surface-muted);
    }
    .progress-fill {
      height: 100%;
      background: var(--color-accent);
      transition: width 300ms ease;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class CopilotActivity {
  protected readonly drafts = inject(CopilotDrafts);

  protected readonly visible = computed(
    () => this.drafts.phase() !== 'idle' && !this.drafts.dialogOpen(),
  );

  protected readonly headline = computed(() => {
    switch (this.drafts.phase()) {
      case 'working':
        return `Drafting… ${String(this.drafts.elapsed())} s`;
      case 'finalizing':
      case 'ready':
        return 'Zap drafted';
      case 'question':
        return 'The Copilot needs an answer';
      case 'unsupported':
        return 'This cannot be built yet';
      default:
        return 'The draft did not finish';
    }
  });

  protected readonly detail = computed(() => {
    switch (this.drafts.phase()) {
      case 'working':
        return this.drafts.activeStep()?.label ?? 'Starting';
      case 'finalizing':
      case 'ready':
        return this.drafts.ready()?.name ?? '';
      case 'question':
        return this.drafts.question()?.text ?? '';
      default:
        return this.drafts.message();
    }
  });
}
