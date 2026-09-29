const MARKER_PREFIX = '<!-- zap-runner';

export function withLoopMarker(body: string, zapId: string): string {
  return `${body}\n\n${MARKER_PREFIX} zap=${zapId} -->`;
}

export function hasLoopMarker(body: string): boolean {
  return body.includes(MARKER_PREFIX);
}
