import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { type Toast, ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="outlet" aria-live="polite" aria-label="Notifications">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="toast"
          [class]="toast.tone"
          [attr.role]="toast.tone === 'error' ? 'alert' : 'status'"
        >
          <span class="dot" aria-hidden="true"></span>
          <p class="message">{{ toast.message }}</p>
          @if (toast.action; as action) {
            <button type="button" class="btn btn-sm" (click)="act(toast)">
              {{ action.label }}
            </button>
          }
          <button
            type="button"
            class="close"
            aria-label="Dismiss notification"
            (click)="toasts.dismiss(toast.id)"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .outlet {
      position: fixed;
      left: 50%;
      bottom: var(--space-5);
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      transform: translateX(-50%);
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 280px;
      max-width: 480px;
      padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      color: var(--color-text);
      font-size: var(--text-sm);
      pointer-events: auto;
    }
    .dot {
      flex: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-success-fg);
    }
    .error .dot {
      background: var(--color-danger-fg);
    }
    .message {
      flex: 1;
      margin: 0;
      line-height: var(--leading-normal);
    }
    .close {
      display: grid;
      place-items: center;
      flex: none;
      width: 24px;
      height: 24px;
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
    }
    .close:hover {
      background: var(--color-hover);
      color: var(--color-text);
    }
  `,
})
export class ToastOutlet {
  protected readonly toasts = inject(ToastService);

  protected act(toast: Toast): void {
    toast.action?.run();
    this.toasts.dismiss(toast.id);
  }
}
