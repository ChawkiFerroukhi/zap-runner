import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { CopilotProviderId, CopilotStatus } from '@zap-runner/shared';
import { toApiError } from '../../core/api-error';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import { CopilotApi } from '../../core/copilot.api';

const KEY_PLACEHOLDERS: Record<CopilotProviderId, string> = {
  gemini: 'Paste your Google AI Studio key',
  openai: 'Paste your OpenAI API key',
  anthropic: 'Paste your Anthropic API key',
};

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings">
      <div class="page-header">
        <h1>Settings</h1>
      </div>

      @if (auth.user(); as user) {
        <section class="card" aria-labelledby="account-heading">
          <p class="label" id="account-heading">Account</p>
          <div class="account">
            <img class="avatar large" [src]="user.avatarUrl" alt="" width="40" height="40" />
            <div>
              <p class="strong">{{ user.name ?? user.login }}</p>
              <p class="muted small">
                Signed in with GitHub as <span class="mono login">{{ user.login }}</span>
              </p>
            </div>
          </div>
        </section>
      }

      <section class="card copilot" aria-labelledby="copilot-heading">
        <div class="card-head">
          <div>
            <p class="label" id="copilot-heading">Copilot</p>
            <h2 class="card-title">Draft Zaps from a description</h2>
          </div>
          @if (status(); as status) {
            <span [class]="status.configured ? 'badge badge-success' : 'badge'">
              {{ status.configured ? 'Connected' : 'Not connected' }}
            </span>
          }
        </div>

        <p class="muted">
          Your description and the list of available triggers and actions are sent to the provider
          you choose. The result is saved as a draft Zap for you to review before it can run. Keys
          are verified with the provider, stored encrypted, and only shown again as their last four
          characters.
        </p>

        @if (status(); as status) {
          @if (status.configured && status.provider; as provider) {
            <dl class="properties saved">
              <dt>Provider</dt>
              <dd>{{ provider.name }}</dd>
              <dt>Models</dt>
              <dd class="mono">{{ provider.models.join(', ') }}</dd>
              <dt>Key</dt>
              <dd class="mono">{{ status.keyHint }}</dd>
              <dt>Source</dt>
              <dd>
                {{
                  status.source === 'account' ? 'Saved to your account' : 'Provided by the server'
                }}
              </dd>
            </dl>
          } @else {
            <p class="saved muted">
              No key saved. Choose a provider and paste a key to turn on the Copilot.
            </p>
          }

          <form class="key-form" [formGroup]="form" (ngSubmit)="save()">
            <div class="field">
              <span class="field-label" id="provider-label">Provider</span>
              <div class="providers" role="radiogroup" aria-labelledby="provider-label">
                @for (provider of status.providers; track provider.id) {
                  <label class="provider" [class.selected]="selectedProvider() === provider.id">
                    <input
                      class="visually-hidden"
                      type="radio"
                      formControlName="provider"
                      [value]="provider.id"
                    />
                    <span class="radio" aria-hidden="true"><span class="dot"></span></span>
                    <span class="provider-text">
                      <span class="strong">{{ provider.name }}</span>
                      <span class="muted small">
                        {{
                          provider.pricing === 'free-tier'
                            ? 'Free tier, no card needed. Rate limited.'
                            : 'Paid, billed by usage.'
                        }}
                      </span>
                    </span>
                  </label>
                }
              </div>
            </div>

            @if (selected(); as provider) {
              <div class="field">
                <label class="field-label" for="api-key">{{ provider.name }} API key</label>
                <input
                  id="api-key"
                  class="input mono"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  formControlName="apiKey"
                  [placeholder]="placeholder()"
                  [attr.aria-invalid]="error() ? true : null"
                />
                <span class="field-help">
                  Create one at
                  <a [href]="provider.keyUrl" target="_blank" rel="noopener">{{
                    provider.keyUrl
                  }}</a>
                </span>
                @if (error(); as message) {
                  <span class="field-error" role="alert">{{ message }}</span>
                }
              </div>
            }

            <div class="actions">
              <button
                type="button"
                class="btn-danger-text"
                [disabled]="busy() || status.source !== 'account'"
                (click)="remove()"
              >
                Remove key
              </button>
              <span class="divider-v" aria-hidden="true"></span>
              <button
                type="submit"
                class="btn btn-primary save"
                [disabled]="busy() || keyValue().trim() === ''"
              >
                {{ busy() ? 'Verifying…' : 'Save key' }}
              </button>
            </div>
          </form>
        } @else if (loadError(); as message) {
          <p class="notice notice-danger" role="alert">{{ message }}</p>
        } @else {
          <span class="skeleton line"></span>
        }
      </section>
    </div>
  `,
  styles: `
    .settings {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 800px;
    }
    .account {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .strong {
      font-weight: var(--weight-medium);
    }
    .login {
      color: var(--color-text);
    }
    .copilot {
      gap: 20px;
    }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .card-title {
      margin-top: 4px;
    }
    .saved {
      padding: 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-bg);
    }
    dl.saved {
      row-gap: 10px;
    }
    .key-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .providers {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .provider {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-bg);
      cursor: pointer;
    }
    .provider:hover {
      border-color: var(--color-border-hover);
    }
    .provider.selected {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
    }
    .radio {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      border: 1.5px solid var(--color-border-hover);
      border-radius: 50%;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-accent);
      opacity: 0;
    }
    .provider.selected .radio {
      border-color: var(--color-accent);
    }
    .provider.selected .dot {
      opacity: 1;
    }
    .provider input:focus-visible + .radio {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .provider-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 4px;
    }
    .save {
      padding: 0 16px;
    }
    .line {
      width: 40%;
      height: 12px;
    }
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  private readonly copilot = inject(CopilotApi);
  private readonly toasts = inject(ToastService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    provider: this.initialProvider(),
    apiKey: [''],
  });
  protected readonly selectedProvider = toSignal(this.form.controls.provider.valueChanges, {
    initialValue: this.form.controls.provider.value,
  });
  protected readonly keyValue = toSignal(this.form.controls.apiKey.valueChanges, {
    initialValue: '',
  });
  protected readonly status = signal<CopilotStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly selected = computed(() =>
    this.status()?.providers.find((provider) => provider.id === this.selectedProvider()),
  );
  protected readonly placeholder = computed(() => KEY_PLACEHOLDERS[this.selectedProvider()]);

  constructor() {
    void this.load();
  }

  protected async save(): Promise<void> {
    const { provider, apiKey } = this.form.getRawValue();
    await this.run(async () => {
      this.status.set(await this.copilot.saveKey(provider, apiKey));
      this.form.controls.apiKey.reset();
      this.toasts.success('Copilot key verified and saved');
    });
  }

  protected async remove(): Promise<void> {
    this.busy.set(true);
    try {
      this.status.set(await this.copilot.removeKey());
      this.toasts.success('Copilot key removed');
    } catch (error) {
      this.toasts.failure('Could not remove the key.', error);
    } finally {
      this.busy.set(false);
    }
  }

  private initialProvider(): CopilotProviderId {
    return 'gemini';
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await task();
    } catch (error) {
      const detail = toApiError(error);
      this.error.set(detail.fields?.['apiKey'] ?? detail.message);
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const status = await this.copilot.status();
      this.status.set(status);
      if (status.provider) this.form.controls.provider.setValue(status.provider.id);
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    }
  }
}
