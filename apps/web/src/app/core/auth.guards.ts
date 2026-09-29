import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const signedInGuard: CanActivateFn = () =>
  inject(AuthService).signedIn() || inject(Router).createUrlTree(['/sign-in']);

export const signedOutGuard: CanActivateFn = () =>
  !inject(AuthService).signedIn() || inject(Router).createUrlTree(['/zaps']);
