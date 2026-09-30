import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'GitHub access was not granted. Try again and approve the request.',
  state_mismatch: 'The sign-in session expired or was tampered with. Start again.',
  github_error: 'GitHub could not complete the sign-in. Try again in a moment.',
  rate_limited: 'Too many sign-in attempts. Wait a few minutes and try again.',
  session_expired: 'Your session expired. Sign in again to continue.',
  github_token_invalid: 'GitHub no longer accepts your previous sign-in. Sign in again.',
};

@Component({
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="sign-in">
      <section class="panel card" aria-labelledby="sign-in-title">
        <p class="wordmark">Zap Runner</p>
        <div class="intro">
          <h1 id="sign-in-title">Sign in</h1>
          <p class="muted">Connect GitHub to build Zaps that react to pull requests.</p>
        </div>

        @if (errorMessage(); as message) {
          <p class="notice notice-danger" role="alert">{{ message }}</p>
        }

        <a class="btn btn-primary btn-block" href="/api/auth/github/login">Continue with GitHub</a>

        <div class="access">
          <p class="label">Access requested</p>
          <dl>
            <dt>Repository webhooks</dt>
            <dd>Created when you turn a Zap on, removed when you turn it off.</dd>
            <dt>Pull request comments</dt>
            <dd>Posted only by Zaps you have enabled.</dd>
          </dl>
        </div>
      </section>
    </main>
  `,
  styles: `
    .sign-in {
      display: grid;
      min-height: 100vh;
      place-items: center;
      padding: var(--space-5);
    }
    .card {
      display: grid;
      gap: var(--space-5);
      width: 100%;
      max-width: 360px;
      padding: var(--space-6);
    }
    .wordmark {
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      letter-spacing: -0.01em;
    }
    .intro {
      display: grid;
      gap: var(--space-1);
    }
    .access {
      display: grid;
      gap: var(--space-2);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border);
    }
    dl {
      display: grid;
      gap: var(--space-1);
      margin: 0;
      font-size: var(--text-xs);
    }
    dt {
      font-weight: var(--weight-medium);
    }
    dd {
      margin: 0 0 var(--space-2);
      color: var(--color-text-muted);
    }
  `,
})
export class SignInPage {
  readonly error = input<string>();

  protected readonly errorMessage = computed(() => {
    const code = this.error();
    if (code === undefined) return null;
    return ERROR_MESSAGES[code] ?? 'Sign-in failed. Try again.';
  });
}
