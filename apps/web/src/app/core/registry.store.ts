import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  ActionDescriptor,
  AppDescriptor,
  RegistryResponse,
  TriggerDescriptor,
} from '@zap-runner/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RegistryStore {
  private readonly http = inject(HttpClient);
  private readonly state = signal<RegistryResponse | null>(null);
  private pending: Promise<void> | null = null;

  readonly registry = this.state.asReadonly();

  load(): Promise<void> {
    this.pending ??= firstValueFrom(this.http.get<RegistryResponse>('/api/registry')).then(
      (registry) => {
        this.state.set(registry);
      },
      (error: unknown) => {
        this.pending = null;
        throw error;
      },
    );
    return this.pending;
  }

  app(id: string): AppDescriptor | undefined {
    return this.state()?.apps.find((app) => app.id === id);
  }

  trigger(id: string): TriggerDescriptor | undefined {
    return this.state()?.triggers.find((trigger) => trigger.id === id);
  }

  action(id: string): ActionDescriptor | undefined {
    return this.state()?.actions.find((action) => action.id === id);
  }
}
