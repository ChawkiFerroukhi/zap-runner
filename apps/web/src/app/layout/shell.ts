import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CopilotDrafts } from '../core/copilot-drafts';
import { CopilotDialog } from '../features/zaps/copilot-dialog';
import { CopilotActivity } from './copilot-activity';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CopilotDialog, CopilotActivity],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="sidebar">
        <p class="wordmark">Zap Runner</p>
        <nav aria-label="Primary" class="nav">
          <p class="label">Workspace</p>
          <a routerLink="/zaps" routerLinkActive="active" ariaCurrentWhenActive="page">Zaps</a>
          <a routerLink="/settings" routerLinkActive="active" ariaCurrentWhenActive="page"
            >Settings</a
          >
        </nav>
        @if (auth.user(); as user) {
          <div class="account">
            <img [src]="user.avatarUrl" alt="" width="24" height="24" />
            <span class="login">{{ user.login }}</span>
            <button type="button" class="btn btn-ghost" (click)="signOut()">Sign out</button>
          </div>
        }
      </aside>
      <main class="content">
        <router-outlet />
      </main>
    </div>
    <app-copilot-dialog />
    <app-copilot-activity />
  `,
  styles: `
    .shell {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      min-height: 100vh;
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-4) var(--space-3);
      border-right: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .wordmark {
      padding: 0 var(--space-2);
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      letter-spacing: -0.01em;
    }
    .nav {
      display: grid;
      gap: 2px;
    }
    .nav .label {
      padding: 0 var(--space-2) var(--space-1);
    }
    .nav a {
      padding: 6px var(--space-2);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-weight: var(--weight-medium);
    }
    .nav a:hover {
      background: var(--color-surface-muted);
      color: var(--color-text);
    }
    .nav a.active {
      background: var(--color-surface-hover);
      color: var(--color-text-strong);
    }
    .account {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: auto;
      padding: var(--space-3) var(--space-2) 0;
      border-top: 1px solid var(--color-border);
    }
    .account img {
      border-radius: 50%;
    }
    .login {
      flex: 1;
      overflow: hidden;
      font-weight: var(--weight-medium);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .content {
      min-width: 0;
      padding: var(--space-6) var(--space-6) var(--space-8);
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly drafts = inject(CopilotDrafts);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    this.drafts.cancel();
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
