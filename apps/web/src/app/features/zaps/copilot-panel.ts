import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { CopilotStatus } from '@zap-runner/shared';
import { CopilotApi } from '../../core/copilot.api';
import { CopilotDrafts } from '../../core/copilot-drafts';

const EXAMPLES = [
  'When a pull request is opened, comment thanks.',
  'When a pull request is merged into main, thank whoever merged it.',
  'When someone comments on a pull request, reply that a maintainer will follow up.',
];

@Component({
  selector: 'app-copilot-panel',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel copilot" aria-labelledby="copilot-title">
      <div class="header">
        <p class="label" id="copilot-title">Copilot</p>
        <span class="muted hint">Describe a Zap. You review it before it runs.</span>
        @if (status()?.provider; as provider) {
          <span class="badge provider-badge">{{ provider.name }}</span>
        }
      </div>

      @if (status(); as status) {
        @if (status.configured) {
          <form class="form" [formGroup]="form" (ngSubmit)="draft()">
            <label class="visually-hidden" for="copilot-prompt">Describe the Zap</label>
            <textarea
              #promptField
              id="copilot-prompt"
              class="textarea prompt"
              rows="2"
              formControlName="prompt"
              [placeholder]="examples[0]"
              (keydown.meta.enter)="draft()"
              (keydown.control.enter)="draft()"
            ></textarea>
            <div class="footer">
              <div class="examples">
                @for (example of examples; track example) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="useExample(example)">
                    {{ example }}
                  </button>
                }
              </div>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="drafts.busy() || form.controls.prompt.value.trim().length < 8"
              >
                Draft Zap
              </button>
            </div>
          </form>
          @if (drafts.busy()) {
            <p class="muted busy">
              A draft is running. You can keep working; it will tell you when it is ready.
            </p>
          }
        } @else {
          <p class="muted">
            Add a Copilot API key in <a routerLink="/settings">Settings</a> to draft Zaps from a
            sentence. A free Google Gemini key works.
          </p>
        }
      } @else {
        <span class="skeleton line"></span>
      }
    </section>
  `,
  styles: `
    .copilot {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .header {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }
    .hint {
      font-size: var(--text-xs);
    }
    .provider-badge {
      margin-left: auto;
    }
    .form {
      display: grid;
      gap: var(--space-3);
    }
    .prompt {
      min-height: 64px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .examples {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    .busy {
      font-size: var(--text-xs);
    }
    .line {
      display: block;
      width: 50%;
      height: 12px;
    }
  `,
})
export class CopilotPanel {
  private readonly copilot = inject(CopilotApi);
  protected readonly drafts = inject(CopilotDrafts);
  private readonly promptField = viewChild<ElementRef<HTMLTextAreaElement>>('promptField');

  protected readonly examples = EXAMPLES;
  protected readonly form = inject(NonNullableFormBuilder).group({ prompt: [''] });
  protected readonly status = signal<CopilotStatus | null>(null);

  constructor() {
    void this.load();
    effect(() => {
      const prompt = this.drafts.promptToEdit();
      const field = this.promptField();
      if (prompt === null || !field) return;
      this.form.controls.prompt.setValue(prompt);
      this.drafts.promptToEdit.set(null);
      field.nativeElement.focus();
    });
  }

  protected useExample(example: string): void {
    this.form.controls.prompt.setValue(example);
  }

  protected draft(): void {
    const prompt = this.form.controls.prompt.value.trim();
    if (prompt.length < 8) return;
    this.drafts.start(prompt);
  }

  private async load(): Promise<void> {
    try {
      this.status.set(await this.copilot.status());
    } catch {
      this.status.set({
        configured: false,
        source: null,
        keyHint: null,
        provider: null,
        providers: [],
      });
    }
  }
}
