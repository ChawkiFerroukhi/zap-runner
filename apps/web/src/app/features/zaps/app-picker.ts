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
          [class.unavailable]="!app.runnable"
          [attr.aria-pressed]="selected() === app.id"
          [disabled]="!app.runnable"
          (click)="choose.emit(app.id)"
        >
          <span class="mono-mark" aria-hidden="true">{{ monogram(app.name) }}</span>
          <span class="text">
            <span class="name">{{ app.name }}</span>
            <span class="sub truncate">{{
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .app {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-bg);
      color: var(--color-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .app:hover:not(:disabled) {
      border-color: var(--color-border-hover);
    }
    .app.selected,
    .app.selected:hover {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
    }
    .app.unavailable {
      border-style: dashed;
      border-color: var(--color-border);
      background: transparent;
      opacity: 0.4;
      cursor: not-allowed;
    }
    .mono-mark {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-bg);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-weight: var(--weight-medium);
    }
    .sub {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
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
