import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AppDescriptor } from '@zap-runner/shared';
import { monogram } from './zap-summary';

@Component({
  selector: 'app-app-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="apps" role="group" [attr.aria-label]="label()">
      @for (app of apps(); track app.id) {
        <button
          type="button"
          class="app"
          [class.selected]="selected() === app.id"
          [attr.aria-pressed]="selected() === app.id"
          [disabled]="!app.runnable"
          (click)="choose.emit(app.id)"
        >
          <span class="monogram" aria-hidden="true">{{ monogram(app.name) }}</span>
          <span class="app-text">
            <span class="app-name">{{ app.name }}</span>
            <span class="app-description">{{
              app.runnable ? app.description : 'Not available yet'
            }}</span>
          </span>
        </button>
      }
    </div>
  `,
  styles: `
    .apps {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      gap: var(--space-2);
    }
    .app {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface-raised);
      color: var(--color-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--transition-fast);
    }
    .app:hover:not(:disabled) {
      border-color: var(--color-border-strong);
    }
    .app.selected {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
    }
    .app:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .app-text {
      display: grid;
      min-width: 0;
    }
    .app-name {
      font-weight: var(--weight-medium);
    }
    .app-description {
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--text-2xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class AppPicker {
  readonly apps = input.required<AppDescriptor[]>();
  readonly selected = input.required<string>();
  readonly label = input.required<string>();
  readonly choose = output<string>();
  protected readonly monogram = monogram;
}
