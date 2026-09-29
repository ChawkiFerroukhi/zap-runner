const KEY = 'copilotExplanation';

export function copilotHandoff(explanation: string): Record<string, string> {
  return { [KEY]: explanation };
}

export function readCopilotHandoff(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !(KEY in state)) return null;
  const value: unknown = Reflect.get(state, KEY);
  return typeof value === 'string' ? value : null;
}
