const PROMPT_KEY = 'copilotPrompt';

export function copilotHandoff(prompt: string): Record<string, string> {
  return { [PROMPT_KEY]: prompt };
}

export function readCopilotHandoff(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !(PROMPT_KEY in state)) return null;
  const value: unknown = Reflect.get(state, PROMPT_KEY);
  return typeof value === 'string' ? value : null;
}
