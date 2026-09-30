import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { ConfigField, RepositoryOption } from '@zap-runner/shared';
import { TemplateInput } from './template-input';

export interface BoundField {
  field: ConfigField;
  control: FormControl<string | boolean>;
}

export interface TemplateFocus {
  key: string;
  label: string;
  event: FocusEvent;
}

@Component({
  selector: 'app-config-field',
  imports: [ReactiveFormsModule, TemplateInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let field = bound().field;
    @let control = bound().control;
    @switch (field.kind) {
      @case ('boolean') {
        <label class="check">
          <input class="visually-hidden" type="checkbox" [formControl]="control" />
          <span class="box" aria-hidden="true"><span class="tick"></span></span>
          <span>{{ field.label }}</span>
        </label>
      }
      @case ('repository') {
        <div class="field">
          <label class="field-label" [attr.for]="'field-' + field.key">{{ field.label }}</label>
          <div class="select-wrap">
            <select
              class="select mono"
              [id]="'field-' + field.key"
              [class.placeholder]="control.value === ''"
              [formControl]="control"
              [attr.aria-invalid]="error() ? true : null"
            >
              <option value="" disabled>
                {{ repositories() === null ? 'Loading repositories…' : 'Choose a repository' }}
              </option>
              @for (repository of repositories() ?? []; track repository.fullName) {
                <option [value]="repository.fullName">{{ repository.fullName }}</option>
              }
            </select>
          </div>
          <span class="field-help"
            >Only repositories where you are an admin appear, since Zap Runner has to create a
            webhook.</span
          >
          @if (repositoriesError(); as message) {
            <span class="field-error">{{ message }}</span>
          }
          @if (error(); as message) {
            <span class="field-error">{{ message }}</span>
          }
        </div>
      }
      @case ('text') {
        <div class="field">
          <label class="field-label" [attr.for]="'field-' + field.key">{{ field.label }}</label>
          <input
            class="input"
            [id]="'field-' + field.key"
            [formControl]="control"
            [placeholder]="field.placeholder ?? ''"
            [attr.aria-invalid]="error() ? true : null"
          />
          @if (field.help) {
            <span class="field-help">{{ field.help }}</span>
          }
          @if (error(); as message) {
            <span class="field-error">{{ message }}</span>
          }
        </div>
      }
      @default {
        <div class="field">
          <span class="field-label">{{ field.label }}</span>
          <app-template-input
            [control]="control"
            [multiline]="field.kind === 'multiline-template'"
            [active]="active()"
            [invalid]="!!error()"
            [label]="field.label"
            [placeholder]="
              field.kind === 'multiline-template'
                ? 'Write the text. Click a field on the right to insert it.'
                : ''
            "
            (focused)="focused.emit({ key: field.key, label: field.label, event: $event })"
          />
          @if (field.help) {
            <span class="field-help">{{ field.help }}</span>
          }
          @if (error(); as message) {
            <span class="field-error">{{ message }}</span>
          }
        </div>
      }
    }
  `,
  styles: `
    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      width: max-content;
      cursor: pointer;
    }
    .box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: 1px solid var(--color-border-hover);
      border-radius: var(--radius-sm);
    }
    .tick {
      width: 8px;
      height: 4px;
      border-bottom: 1.5px solid var(--color-accent-contrast);
      border-left: 1.5px solid var(--color-accent-contrast);
      opacity: 0;
      transform: rotate(-45deg) translate(1px, -1px);
    }
    .check input:checked + .box {
      border-color: var(--color-accent);
      background: var(--color-accent);
    }
    .check input:checked + .box .tick {
      opacity: 1;
    }
    .check input:focus-visible + .box {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .select.placeholder {
      color: var(--color-text-subtle);
    }
  `,
})
export class ConfigFieldControl {
  readonly bound = input.required<BoundField>();
  readonly error = input<string>();
  readonly active = input(false);
  readonly repositories = input<RepositoryOption[] | null>(null);
  readonly repositoriesError = input<string | null>(null);
  readonly focused = output<TemplateFocus>();
}
