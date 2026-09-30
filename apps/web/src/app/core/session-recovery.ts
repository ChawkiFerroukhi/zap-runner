import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { toApiError, type ApiErrorDetail } from './api-error';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const SESSION_PROBE = '/api/auth/me';

@Injectable({ providedIn: 'root' })
export class SessionRecovery {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  handle(detail: Pick<ApiErrorDetail, 'code' | 'message'>): void {
    if (detail.code === 'unauthenticated' && this.auth.signedIn()) {
      this.auth.clear();
      void this.router.navigate(['/sign-in'], { queryParams: { error: 'session_expired' } });
      return;
    }
    if (detail.code === 'github_token_invalid') {
      this.toasts.error(detail.message, {
        label: 'Sign in again',
        run: () => {
          void this.signOut('github_token_invalid');
        },
      });
    }
  }

  async signOut(reason: string | null = null): Promise<boolean> {
    try {
      await this.auth.signOut();
    } catch (error) {
      if (!reason) {
        this.toasts.error(`Could not sign out. ${toApiError(error).message}`);
        return false;
      }
      this.auth.clear();
    }
    await this.router.navigate(['/sign-in'], reason ? { queryParams: { error: reason } } : {});
    return true;
  }
}

export const sessionRecoveryInterceptor: HttpInterceptorFn = (request, next) => {
  const recovery = inject(SessionRecovery);
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && !request.url.endsWith(SESSION_PROBE))
          recovery.handle(toApiError(error));
      },
    }),
  );
};
