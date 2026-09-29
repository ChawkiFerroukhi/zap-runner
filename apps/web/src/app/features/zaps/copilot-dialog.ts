import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CopilotDrafts } from '../../core/copilot-drafts';

@Component({
  selector: 'app-copilot-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="dialog"
      aria-labelledby="copilot-dialog-title"
      (cancel)="onEscape($event)"
    >
      <header class="head">
        <div>
          <p class="label">Copilot</p>
          <h2 id="copilot-dialog-title">{{ title() }}</h2>
        </div>
      </header>

      <p class="prompt">“{{ drafts.prompt() }}”</p>

      <div
        class="progress"
        role="progressbar"
        aria-label="Drafting progress"
        [attr.aria-valuenow]="drafts.percent()"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="progress-fill"
          [style.width.%]="drafts.percent()"
          [class.running]="drafts.phase() === 'working'"
        ></div>
      </div>

      <ol class="steps" aria-live="polite">
        @for (step of drafts.steps(); track step.id) {
          <li class="step" [attr.data-state]="step.state">
            <span class="marker" aria-hidden="true"></span>
            <div class="step-text">
              <span>{{ step.label }}</span>
              @for (note of step.notes; track $index) {
                <span class="note">{{ note }}</span>
              }
            </div>
            @if (step.state === 'active') {
              <span class="elapsed">{{ drafts.elapsed() }} s</span>
            }
          </li>
        }
      </ol>

      @switch (drafts.phase()) {
        @case ('finalizing') {
          <p class="finalizing" role="status">
            <span class="marker-spin" aria-hidden="true"></span>
            Finalizing, opening your draft…
          </p>
        }
        @case ('working') {
          <div class="actions">
            <button type="button" class="btn btn-ghost" (click)="drafts.cancel()">
              Cancel draft
            </button>
            <button type="button" class="btn" (click)="drafts.background()">
              Continue in background
            </button>
          </div>
        }
        @case ('question') {
          @if (drafts.question(); as question) {
            <form class="question" [formGroup]="answerForm" (ngSubmit)="submitAnswer()">
              <p class="question-text">{{ question.text }}</p>
              @if (question.kind === 'repository') {
                @if (question.options.length > 8) {
                  <input
                    class="input"
                    type="search"
                    placeholder="Filter repositories"
                    aria-label="Filter repositories"
                    [value]="filter()"
                    (input)="filterFrom($event)"
                  />
                }
                <div class="options" role="radiogroup" [attr.aria-label]="question.text">
                  @for (option of filtered(question.options); track option) {
                    <label class="option" [class.selected]="answerControl.value === option">
                      <input
                        type="radio"
                        name="copilot-answer"
                        [value]="option"
                        formControlName="answer"
                      />
                      <span class="mono">{{ option }}</span>
                    </label>
                  }
                </div>
              } @else {
                <input class="input" formControlName="answer" placeholder="Your answer" />
              }
              <div class="actions">
                <button type="button" class="btn btn-ghost" (click)="drafts.dismiss()">
                  Cancel
                </button>
                <button type="button" class="btn btn-ghost" (click)="drafts.editDescription()">
                  Edit description
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="answerControl.value.trim() === ''"
                >
                  Continue
                </button>
              </div>
            </form>
          }
        }
        @case ('unsupported') {
          <div class="outcome">
            <p>{{ drafts.message() }}</p>
            <div class="actions">
              <button type="button" class="btn btn-ghost" (click)="drafts.dismiss()">Close</button>
              <button type="button" class="btn btn-primary" (click)="drafts.editDescription()">
                Edit description
              </button>
            </div>
          </div>
        }
        @case ('failed') {
          <div class="outcome">
            <p class="notice notice-warning">{{ drafts.message() }}</p>
            <div class="actions">
              <button type="button" class="btn btn-ghost" (click)="drafts.editDescription()">
                Edit description
              </button>
              <button type="button" class="btn btn-primary" (click)="drafts.retry()">
                Try again
              </button>
            </div>
          </div>
        }
      }
    </dialog>
  `,
  styles: `
    .dialog {
      width: min(520px, calc(100vw - 32px));
      padding: var(--space-5);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-md);
      color: var(--color-text);
    }
    .dialog[open] {
      display: grid;
      gap: var(--space-4);
    }
    .dialog::backdrop {
      background: rgb(0 0 0 / 0.6);
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .prompt {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
    .progress {
      height: 4px;
      overflow: hidden;
      border-radius: 2px;
      background: var(--color-surface-muted);
    }
    .progress-fill {
      height: 100%;
      background: var(--color-accent);
      transition: width 300ms ease;
    }
    .progress-fill.running {
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.6;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .progress-fill.running {
        animation: none;
      }
    }
    .steps {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .step {
      display: grid;
      grid-template-columns: 16px 1fr auto;
      align-items: start;
      gap: var(--space-3);
      color: var(--color-text-subtle);
    }
    .step[data-state='active'],
    .step[data-state='done'] {
      color: var(--color-text);
    }
    .step[data-state='skipped'] {
      color: var(--color-text-muted);
    }
    .marker {
      width: 12px;
      height: 12px;
      margin-top: 3px;
      border: 1px solid var(--color-border-strong);
      border-radius: 50%;
    }
    .step[data-state='active'] .marker {
      border: 2px solid var(--color-accent);
      border-top-color: transparent;
      animation: spin 0.9s linear infinite;
    }
    .step[data-state='done'] .marker {
      border-color: var(--color-success-fg);
      background: var(--color-success-fg);
    }
    .step[data-state='skipped'] .marker {
      border-style: dashed;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .step[data-state='active'] .marker {
        animation: none;
      }
    }
    .step-text {
      display: grid;
      gap: 2px;
    }
    .note {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
    .elapsed {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-variant-numeric: tabular-nums;
    }
    .finalizing {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border);
      color: var(--color-text);
    }
    .marker-spin {
      width: 12px;
      height: 12px;
      border: 2px solid var(--color-accent);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .marker-spin {
        animation: none;
      }
    }
    .question,
    .outcome {
      display: grid;
      gap: var(--space-3);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border);
    }
    .question-text {
      font-weight: var(--weight-medium);
    }
    .options {
      display: grid;
      gap: var(--space-1);
      max-height: 220px;
      overflow-y: auto;
    }
    .option {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      cursor: pointer;
    }
    .option.selected {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
    }
    .option input {
      margin: 0;
      accent-color: var(--color-accent);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class CopilotDialog {
  protected readonly drafts = inject(CopilotDrafts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly answerControl = new FormControl('', { nonNullable: true });
  protected readonly answerForm = new FormGroup({ answer: this.answerControl });

  protected readonly title = computed(() => {
    switch (this.drafts.phase()) {
      case 'question':
        return 'One question before saving';
      case 'unsupported':
        return 'This cannot be built yet';
      case 'failed':
        return 'The draft did not finish';
      case 'finalizing':
        return 'Your Zap is drafted';
      default:
        return 'Drafting your Zap';
    }
  });

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      const open = this.drafts.dialogOpen();
      if (open && !element.open) element.showModal();
      if (!open && element.open) element.close();
    });
    effect(() => {
      if (this.drafts.question()) {
        this.answerControl.reset();
        this.filter.set('');
      }
    });
  }

  protected readonly filter = signal('');

  protected filtered(options: string[]): string[] {
    const term = this.filter().trim().toLowerCase();
    return term === '' ? options : options.filter((option) => option.toLowerCase().includes(term));
  }

  protected filterFrom(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.filter.set(event.target.value);
  }

  protected submitAnswer(): void {
    this.drafts.answer(this.answerControl.value);
  }

  protected onEscape(event: Event): void {
    event.preventDefault();
    if (this.drafts.phase() === 'working') this.drafts.background();
    else this.drafts.dismiss();
  }
}
