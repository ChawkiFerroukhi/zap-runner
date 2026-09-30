import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const TOKEN_SPLIT = /(\{\{[^}]*\}\})/;

@Component({
  selector: 'app-token-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (segment of segments(); track $index) {
    @if (segment.token) {
      <span class="token">{{ segment.text }}</span>
    } @else {
      <span>{{ segment.text }}</span>
    }
  }`,
  styles: `
    :host {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      line-height: 20px;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
  `,
})
export class TokenText {
  readonly text = input.required<string>();

  protected readonly segments = computed(() =>
    this.text()
      .split(TOKEN_SPLIT)
      .filter((part) => part.length > 0)
      .map((part) => ({ text: part, token: part.startsWith('{{') })),
  );
}
