import { Injectable, signal } from '@angular/core';
import { handledGlobally, toApiError } from './api-error';

export type ToastTone = 'success' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action: ToastAction | null;
}

const MAX_VISIBLE = 3;
const DURATION_MS: Record<ToastTone, number> = { success: 4000, error: 8000 };

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  success(message: string): void {
    this.show('success', message, null);
  }

  error(message: string, action: ToastAction | null = null): void {
    this.show('error', message, action);
  }

  failure(what: string, error: unknown): void {
    const detail = toApiError(error);
    if (!handledGlobally(detail)) this.error(`${what} ${detail.message}`);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.items.update((items) => items.filter((toast) => toast.id !== id));
  }

  private show(tone: ToastTone, message: string, action: ToastAction | null): void {
    const duplicate = this.items().find(
      (toast) => toast.tone === tone && toast.message === message,
    );
    if (duplicate) this.dismiss(duplicate.id);
    const toast: Toast = { id: this.nextId++, tone, message, action };
    this.items.update((items) => [...items, toast]);
    const overflow = this.items().slice(0, -MAX_VISIBLE);
    for (const old of overflow) this.dismiss(old.id);
    if (!action) {
      this.timers.set(
        toast.id,
        setTimeout(() => {
          this.dismiss(toast.id);
        }, DURATION_MS[tone]),
      );
    }
  }
}
