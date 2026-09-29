import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { ConfigField, RepositoryOption } from '@zap-runner/shared';

export interface BoundField {
  field: ConfigField;
  control: FormControl<string | boolean>;
}

export interface TemplateFocus {
  key: string;
  event: FocusEvent;
}

@Component({
  selector: 'app-config-field',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let field = bound().field;
    @let control = bound().control;
    @switch (field.kind) {
      @case ('boolean') {
        <label class="checkbox">
          <input type="checkbox" [formControl]="control" />
          {{ field.label }}
        </label>
      }
      @case ('repository') {
        <label class="field">
          <span class="field-label">{{ field.label }}</span>
          <select
            class="select mono"
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
          <span class="field-help"
            >Repositories where your account is an admin, so a webhook can be added.</span
          >
          @if (repositoriesError(); as message) {
            <span class="field-error">{{ message }}</span>
          }
          @if (error(); as message) {
            <span class="field-error">{{ message }}</span>
          }
        </label>
      }
      @case ('multiline-template') {
        <label class="field">
          <span class="field-label">{{ field.label }}</span>
          <textarea
            class="textarea"
            rows="4"
            [formControl]="control"
            [attr.aria-invalid]="error() ? true : null"
            (focus)="focused.emit({ key: field.key, event: $event })"
          ></textarea>
          @if (field.help) {
            <span class="field-help">{{ field.help }}</span>
          }
          @if (error(); as message) {
            <span class="field-error">{{ message }}</span>
          }
        </label>
      }
      @default {
        <label class="field">
          <span class="field-label">{{ field.label }}</span>
          <input
            class="input"
            [class.mono]="field.kind === 'template'"
            [formControl]="control"
            [placeholder]="field.placeholder ?? ''"
            [attr.aria-invalid]="error() ? true : null"
            (focus)="focused.emit({ key: field.key, event: $event })"
          />
          @if (field.help) {
            <span class="field-help">{{ field.help }}</span>
          }
          @if (error(); as message) {
            <span class="field-error">{{ message }}</span>
          }
        </label>
      }
    }
  `,
})
export class ConfigFieldControl {
  readonly bound = input.required<BoundField>();
  readonly error = input<string>();
  readonly repositories = input<RepositoryOption[] | null>(null);
  readonly repositoriesError = input<string | null>(null);
  readonly focused = output<TemplateFocus>();
}
