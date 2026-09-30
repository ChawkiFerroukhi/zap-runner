import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';

interface Segment {
  text: string;
  token: boolean;
}

const TOKEN_SPLIT = /(\{\{[^}]*\}\})/;

@Component({
  selector: 'app-template-input',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="mirror" aria-hidden="true">
        @for (segment of segments(); track $index) {
          @if (segment.token) {
            <span class="token">{{ segment.text }}</span>
          } @else {
            <span>{{ segment.text }}</span>
          }
        }
      </div>
      <textarea
        #area
        class="area"
        rows="1"
        spellcheck="false"
        [class.active]="active()"
        [class.invalid]="invalid()"
        [attr.aria-invalid]="invalid() ? true : null"
        [attr.aria-label]="label()"
        [placeholder]="placeholder()"
        [formControl]="control()"
        [style.min-height.px]="multiline() ? 100 : 40"
        (focus)="focused.emit($event)"
        (keydown.enter)="onEnter($event)"
        (input)="resize()"
      ></textarea>
    </div>
  `,
  styles: `
    .wrap {
      position: relative;
      border-radius: var(--radius-md);
      background: var(--color-bg);
    }
    .mirror,
    .area {
      padding: 9px 12px;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      line-height: 20px;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
    .mirror {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border: 1px solid transparent;
      color: var(--color-text);
      pointer-events: none;
    }
    .area {
      position: relative;
      display: block;
      width: 100%;
      overflow: hidden;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: transparent;
      color: transparent;
      caret-color: var(--color-text);
      outline: none;
      resize: none;
    }
    .area.active,
    .area:focus {
      border-color: var(--color-accent);
    }
    .area.invalid {
      border-color: var(--color-danger-fg);
    }
  `,
})
export class TemplateInput {
  readonly control = input.required<FormControl<string | boolean>>();
  readonly multiline = input(false);
  readonly active = input(false);
  readonly invalid = input(false);
  readonly placeholder = input('');
  readonly label = input('');
  readonly focused = output<FocusEvent>();

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');
  private readonly value = signal('');

  protected readonly segments = computed<Segment[]>(() => {
    const parts = this.value()
      .split(TOKEN_SPLIT)
      .filter((part) => part.length > 0)
      .map((part) => ({ text: part, token: part.startsWith('{{') }));
    return [...parts, { text: ' ', token: false }];
  });

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      this.value.set(String(control.value));
      const subscription = control.valueChanges.subscribe((value) => {
        this.value.set(String(value));
        queueMicrotask(() => {
          this.resize();
        });
      });
      onCleanup(() => {
        subscription.unsubscribe();
      });
    });
    effect(() => {
      this.area();
      queueMicrotask(() => {
        this.resize();
      });
    });
  }

  protected onEnter(event: Event): void {
    if (!this.multiline()) event.preventDefault();
  }

  protected resize(): void {
    const element = this.area().nativeElement;
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight + 2)}px`;
  }
}
