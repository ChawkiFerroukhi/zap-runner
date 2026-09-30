import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb {
  label: string;
  link?: string[];
}

@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Breadcrumb">
      <ol class="crumbs">
        @for (crumb of items(); track $index; let last = $last) {
          <li class="crumb">
            @if (crumb.link) {
              <a class="link truncate" [routerLink]="crumb.link">{{ crumb.label }}</a>
            } @else {
              <span class="current truncate" aria-current="page">{{ crumb.label }}</span>
            }
            @if (!last) {
              <span class="separator" aria-hidden="true">/</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    .crumbs {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      margin: 0 0 6px;
      padding: 0;
      font-size: var(--text-sm);
      list-style: none;
    }
    .crumb {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }
    .link {
      max-width: 320px;
      color: var(--color-text-muted);
      text-decoration: none;
    }
    .link:hover {
      color: var(--color-text);
      text-decoration: none;
    }
    .separator {
      color: var(--color-text-subtle);
    }
    .current {
      max-width: 320px;
      color: var(--color-text);
    }
  `,
})
export class Breadcrumbs {
  readonly items = input.required<Crumb[]>();
}
