import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  CopilotDraftInput,
  CopilotEvent,
  CopilotQuestion,
  CopilotStepId,
} from '@zap-runner/shared';
import type { Subscription } from 'rxjs';
import { CopilotApi } from './copilot.api';
import { copilotHandoff } from './copilot-handoff';

export type StepState = 'pending' | 'active' | 'done' | 'skipped';

export interface StepView {
  id: CopilotStepId;
  label: string;
  state: StepState;
  notes: string[];
}

export type DraftPhase =
  'idle' | 'working' | 'finalizing' | 'question' | 'ready' | 'unsupported' | 'failed';

export type DialogView = 'choose' | 'describe';

interface ReadyDraft {
  zapId: string;
  name: string;
  explanation: string;
}

const FINALIZE_MS = 2_000;

const INITIAL_STEPS: StepView[] = [
  { id: 'repositories', label: 'Read your repositories', state: 'pending', notes: [] },
  { id: 'model', label: 'Draft the Zap', state: 'pending', notes: [] },
  { id: 'check', label: 'Check the draft', state: 'pending', notes: [] },
  { id: 'save', label: 'Save it as a draft', state: 'pending', notes: [] },
];

@Injectable({ providedIn: 'root' })
export class CopilotDrafts {
  private readonly api = inject(CopilotApi);
  private readonly router = inject(Router);

  readonly prompt = signal('');
  readonly steps = signal<StepView[]>(INITIAL_STEPS);
  readonly phase = signal<DraftPhase>('idle');
  readonly question = signal<CopilotQuestion | null>(null);
  readonly message = signal('');
  readonly elapsed = signal(0);
  readonly dialogOpen = signal(false);
  readonly view = signal<DialogView>('choose');
  readonly describeText = signal('');
  readonly ready = signal<ReadyDraft | null>(null);

  readonly busy = computed(() => this.phase() === 'working');
  readonly activeStep = computed(
    () => this.steps().find((step) => step.state === 'active') ?? null,
  );
  readonly percent = computed(() => {
    const steps = this.steps();
    const finished = steps.filter(
      (step) => step.state === 'done' || step.state === 'skipped',
    ).length;
    if (this.phase() === 'finalizing' || this.phase() === 'ready') return 100;
    if (this.phase() === 'finalizing' || this.phase() === 'ready') return 100;
    const active = steps.some((step) => step.state === 'active') ? 0.5 : 0;
    return Math.round(((finished + active) / steps.length) * 100);
  });

  private subscription: Subscription | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastInput: CopilotDraftInput | null = null;
  private finalizeTimer: ReturnType<typeof setTimeout> | null = null;

  openNew(): void {
    this.view.set(this.phase() === 'idle' ? 'choose' : 'describe');
    this.dialogOpen.set(true);
  }

  chooseDescribe(): void {
    this.view.set('describe');
  }

  backToChoose(): void {
    this.view.set('choose');
  }

  chooseManual(): void {
    this.dialogOpen.set(false);
    void this.router.navigateByUrl('/zaps/new');
  }

  close(): void {
    if (this.phase() === 'working' || this.phase() === 'finalizing') {
      this.background();
      return;
    }
    if (this.phase() !== 'idle' && this.phase() !== 'ready') this.reset();
    this.dialogOpen.set(false);
  }

  start(prompt: string): void {
    this.prompt.set(prompt);
    this.steps.set(INITIAL_STEPS);
    this.ready.set(null);
    this.view.set('describe');
    this.dialogOpen.set(true);
    this.run({ prompt });
  }

  answer(value: string): void {
    const question = this.question();
    if (!question || value.trim() === '') return;
    this.run({
      prompt: this.prompt(),
      answer: { pendingId: question.pendingId, value: value.trim() },
    });
  }

  retry(): void {
    if (this.lastInput) this.run(this.lastInput);
  }

  background(): void {
    this.dialogOpen.set(false);
  }

  reopen(): void {
    if (this.phase() === 'ready') {
      void this.review();
      return;
    }
    this.view.set('describe');
    this.dialogOpen.set(true);
  }

  cancel(): void {
    this.stop();
    this.reset();
  }

  dismiss(): void {
    this.cancel();
  }

  editDescription(): void {
    const prompt = this.prompt();
    this.stop();
    this.reset();
    this.describeText.set(prompt);
    this.view.set('describe');
    this.dialogOpen.set(true);
  }

  async review(): Promise<void> {
    const ready = this.ready();
    if (!ready) return;
    const prompt = this.prompt();
    this.reset();
    this.describeText.set('');
    await this.router.navigate(['/zaps', ready.zapId, 'edit'], { state: copilotHandoff(prompt) });
  }

  private run(input: CopilotDraftInput): void {
    this.stop();
    this.lastInput = input;
    this.phase.set('working');
    this.question.set(null);
    this.startClock();
    this.subscription = this.api.draft(input).subscribe((event) => {
      this.apply(event);
    });
  }

  private apply(event: CopilotEvent): void {
    switch (event.type) {
      case 'step':
        this.updateStep(event.step, (step) => ({
          ...step,
          state: event.state,
          label: event.label,
        }));
        if (event.state === 'active') this.elapsed.set(0);
        break;
      case 'note':
        this.updateStep(event.step, (step) => ({ ...step, notes: [...step.notes, event.message] }));
        break;
      case 'question':
        this.settle('question');
        this.question.set(event.question);
        break;
      case 'unsupported':
        this.settle('unsupported');
        this.message.set(event.message);
        break;
      case 'failed':
        this.settle('failed');
        this.message.set(event.message);
        break;
      case 'drafted':
        this.settle('finalizing');
        this.steps.update((steps) =>
          steps.map((step) => (step.state === 'skipped' ? step : { ...step, state: 'done' })),
        );
        this.ready.set({
          zapId: event.zap.id,
          name: event.zap.name,
          explanation: event.explanation,
        });
        this.finalizeTimer = setTimeout(() => {
          this.finalizeTimer = null;
          this.phase.set('ready');
          if (this.dialogOpen()) void this.review();
        }, FINALIZE_MS);
        break;
    }
  }

  private updateStep(id: CopilotStepId, change: (step: StepView) => StepView): void {
    this.steps.update((steps) => steps.map((step) => (step.id === id ? change(step) : step)));
  }

  private settle(phase: DraftPhase): void {
    this.stopClock();
    this.subscription = null;
    this.phase.set(phase);
  }

  private reset(): void {
    this.phase.set('idle');
    this.dialogOpen.set(false);
    this.question.set(null);
    this.ready.set(null);
    this.message.set('');
    this.steps.set(INITIAL_STEPS);
  }

  private startClock(): void {
    this.stopClock();
    this.elapsed.set(0);
    this.timer = setInterval(() => {
      this.elapsed.update((seconds) => seconds + 1);
    }, 1000);
  }

  private stopClock(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private stop(): void {
    if (this.finalizeTimer) clearTimeout(this.finalizeTimer);
    this.finalizeTimer = null;
    this.stopClock();
    this.subscription?.unsubscribe();
    this.subscription = null;
  }
}
