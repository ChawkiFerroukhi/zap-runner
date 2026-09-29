import { randomUUID } from 'node:crypto';
import type { CopilotDraft } from './copilot-model.js';

const TTL_MS = 10 * 60_000;

export interface PendingDraft {
  userId: string;
  prompt: string;
  draft: CopilotDraft;
  model: string;
  awaiting: 'repository' | 'clarification';
  options: string[];
}

export interface PendingDrafts {
  hold(pending: PendingDraft): string;
  take(userId: string, pendingId: string): PendingDraft | null;
}

export function createPendingDrafts(now: () => number = Date.now): PendingDrafts {
  const entries = new Map<string, PendingDraft & { expiresAt: number }>();

  function sweep(): void {
    const current = now();
    for (const [id, entry] of entries) if (entry.expiresAt <= current) entries.delete(id);
  }

  return {
    hold(pending) {
      sweep();
      const id = randomUUID();
      entries.set(id, { ...pending, expiresAt: now() + TTL_MS });
      return id;
    },

    take(userId, pendingId) {
      sweep();
      const entry = entries.get(pendingId);
      if (entry?.userId !== userId) return null;
      entries.delete(pendingId);
      return entry;
    },
  };
}
