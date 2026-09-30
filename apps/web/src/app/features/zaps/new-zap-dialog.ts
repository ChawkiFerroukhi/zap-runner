import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
  selector: 'app-new-zap-dialog',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-zap-dialog.html',
  styleUrl: './new-zap-dialog.css',
})
export class NewZapDialog {
  protected readonly drafts = inject(CopilotDrafts);
  private readonly copilot = inject(CopilotApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly promptField = viewChild<ElementRef<HTMLTextAreaElement>>('promptField');

  protected readonly examples = EXAMPLES;
  protected readonly status = signal<CopilotStatus | null>(null);
  protected readonly promptControl = new FormControl('', { nonNullable: true });
  protected readonly describeForm = new FormGroup({ prompt: this.promptControl });
  protected readonly promptText = signal('');
  protected readonly answerControl = new FormControl('', { nonNullable: true });
  protected readonly answerForm = new FormGroup({ answer: this.answerControl });
  protected readonly filter = signal('');

  protected readonly title = computed(() => {
    switch (this.drafts.phase()) {
      case 'question':
        return 'One question before saving';
      case 'unsupported':
        return 'This cannot be built yet';
      case 'failed':
        return 'The draft did not finish';
      case 'finalizing':
      case 'ready':
        return 'Your Zap is drafted';
      case 'working':
        return 'Drafting your Zap';
      default:
        return 'New Zap';
    }
  });

  protected readonly canDraft = computed(
    () =>
      this.promptText().trim().length >= 8 &&
      this.status()?.configured === true &&
      !this.drafts.busy(),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const element = this.dialog().nativeElement;
      const onClick = (event: MouseEvent): void => {
        if (event.target === element) this.drafts.close();
      };
      element.addEventListener('click', onClick);
      destroyRef.onDestroy(() => {
        element.removeEventListener('click', onClick);
      });
    });
    this.promptControl.valueChanges.subscribe((value) => {
      this.promptText.set(value);
    });
    effect(() => {
      const element = this.dialog().nativeElement;
      const open = this.drafts.dialogOpen();
      if (open && !element.open) {
        element.showModal();
        element.focus();
        void this.loadStatus();
      }
      if (!open && element.open) element.close();
    });
    effect(() => {
      if (this.drafts.view() !== 'describe') return;
      const text = this.drafts.describeText();
      this.promptControl.setValue(text);
      setTimeout(() => this.promptField()?.nativeElement.focus(), 30);
    });
    effect(() => {
      if (this.drafts.question()) {
        this.answerControl.reset();
        this.filter.set('');
      }
    });
  }

  protected useExample(example: string): void {
    this.promptControl.setValue(example);
    this.promptField()?.nativeElement.focus();
  }

  protected draft(): void {
    if (!this.canDraft()) return;
    this.drafts.describeText.set(this.promptControl.value);
    this.drafts.start(this.promptControl.value.trim());
  }

  protected submitAnswer(): void {
    this.drafts.answer(this.answerControl.value);
  }

  protected filtered(options: string[]): string[] {
    const term = this.filter().trim().toLowerCase();
    return term === '' ? options : options.filter((option) => option.toLowerCase().includes(term));
  }

  protected filterFrom(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.filter.set(event.target.value);
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.drafts.close();
  }

  private async loadStatus(): Promise<void> {
    try {
      this.status.set(await this.copilot.status());
    } catch {
      this.status.set(null);
    }
  }
}
