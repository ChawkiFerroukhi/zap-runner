import type { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'sign-in',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/sign-in/sign-in.page').then((m) => m.SignInPage),
    title: 'Sign in · Zap Runner',
  },
  {
    path: '',
    canActivate: [signedInGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: 'zaps',
        loadComponent: () => import('./features/zaps/zaps.page').then((m) => m.ZapsPage),
        title: 'Zaps · Zap Runner',
      },
      { path: '', pathMatch: 'full', redirectTo: 'zaps' },
    ],
  },
  { path: '**', redirectTo: '' },
];
