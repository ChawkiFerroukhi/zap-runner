import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CopilotDrafts } from '../core/copilot-drafts';
import { NewZapDialog } from '../features/zaps/new-zap-dialog';
import { Icon, type IconName } from '../ui/icon';
import { CopilotActivity } from './copilot-activity';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, NewZapDialog, CopilotActivity],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <aside class="sidebar">
        <a class="brand" routerLink="/zaps">
          <span class="mark"><app-icon name="bolt" [size]="14" [filled]="true" /></span>
          <span class="name">Zap Runner</span>
        </a>
        <div class="rule"></div>
        <nav class="nav" aria-label="Primary">
          @for (item of nav; track item.path) {
            <a
              class="nav-item"
              [routerLink]="item.path"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
            >
              <app-icon [name]="item.icon" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        @if (auth.user(); as user) {
          <div class="account">
            <img class="avatar" [src]="user.avatarUrl" alt="" width="28" height="28" />
            <span class="login">{{ user.login }}</span>
            <button type="button" class="sign-out" (click)="signOut()">Sign out</button>
          </div>
        }
      </aside>
      <main class="content">
        <div class="inner">
          <router-outlet />
        </div>
      </main>
    </div>
    <app-new-zap-dialog />
    <app-copilot-activity />
  `,
  styles: `
    .layout {
      display: flex;
      min-width: 1360px;
      min-height: 100vh;
    }
    .sidebar {
      position: sticky;
      top: 0;
      display: flex;
      flex: none;
      flex-direction: column;
      width: var(--sidebar-width);
      height: 100vh;
      padding: 20px 12px 16px;
      border-right: 1px solid var(--color-border);
      background: var(--color-bg);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 32px;
      padding: 0 10px;
      color: var(--color-text-strong);
    }
    .brand:hover {
      color: var(--color-text-strong);
      text-decoration: none;
    }
    .mark {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-md);
      background: var(--color-accent);
      color: var(--color-accent-contrast);
    }
    .name {
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      letter-spacing: -0.01em;
    }
    .rule {
      height: 1px;
      margin: 16px 0 12px;
      background: var(--color-divider);
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 32px;
      padding: 0 10px;
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: var(--text-md);
    }
    .nav-item app-icon {
      opacity: 0.8;
    }
    .nav-item:hover,
    .nav-item.active {
      background: var(--color-hover);
      color: var(--color-text);
      text-decoration: none;
    }
    .nav-item.active app-icon {
      opacity: 1;
    }
    .account {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: auto;
      padding: 14px 12px 0;
      border-top: 1px solid var(--color-border);
    }
    .login {
      flex: 1;
      min-width: 0;
      font-weight: var(--weight-medium);
      white-space: nowrap;
    }
    .sign-out {
      flex: none;
      padding: 4px 0;
      border: 0;
      background: transparent;
      color: var(--color-text-muted);
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }
    .sign-out:hover {
      color: var(--color-text);
    }
    .content {
      flex: 1;
      min-width: 0;
      padding: 32px 40px 96px;
    }
    .inner {
      max-width: var(--content-max-width);
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly drafts = inject(CopilotDrafts);

  protected readonly nav: NavItem[] = [
    { path: '/zaps', label: 'Zaps', icon: 'bolt' },
    { path: '/runs', label: 'Runs', icon: 'activity' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  protected async signOut(): Promise<void> {
    this.drafts.cancel();
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
