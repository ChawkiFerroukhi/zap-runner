import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { SessionUser } from '@zap-runner/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly current = signal<SessionUser | null>(null);

  readonly user = this.current.asReadonly();
  readonly signedIn = computed(() => this.current() !== null);

  async load(): Promise<void> {
    try {
      this.current.set(await firstValueFrom(this.http.get<SessionUser>('/api/auth/me')));
    } catch {
      this.current.set(null);
    }
  }

  clear(): void {
    this.current.set(null);
  }

  async signOut(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', null));
    this.current.set(null);
  }
}
