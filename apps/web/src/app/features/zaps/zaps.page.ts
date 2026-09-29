import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-zaps-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Zaps</h1>
    </header>
    <section class="panel empty">
      <h2>No Zaps yet</h2>
      <p class="muted">
        A Zap pairs a trigger with an action, such as commenting on every new pull request.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-5);
      max-width: var(--content-max-width);
    }
    .empty {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-7) var(--space-5);
      text-align: center;
    }
  `,
})
export class ZapsPage {}
