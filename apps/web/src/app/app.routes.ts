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
      {
        path: 'zaps/new',
        loadComponent: () =>
          import('./features/zaps/zap-builder.page').then((m) => m.ZapBuilderPage),
        title: 'New Zap · Zap Runner',
      },
      {
        path: 'zaps/:zapId',
        loadComponent: () => import('./features/zaps/zap-detail.page').then((m) => m.ZapDetailPage),
        title: 'Zap · Zap Runner',
      },
      {
        path: 'zaps/:zapId/edit',
        loadComponent: () =>
          import('./features/zaps/zap-builder.page').then((m) => m.ZapBuilderPage),
        title: 'Edit Zap · Zap Runner',
      },
      {
        path: 'runs',
        loadComponent: () => import('./features/runs/runs.page').then((m) => m.RunsPage),
        title: 'Runs · Zap Runner',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
        title: 'Settings · Zap Runner',
      },
      { path: '', pathMatch: 'full', redirectTo: 'zaps' },
    ],
  },
  { path: '**', redirectTo: '' },
];
