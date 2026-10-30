import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { unsavedChangesGuard } from './core/unsaved-changes.guard';
import { Dashboard } from './features/dashboard/dashboard';
import { Login } from './features/login/login';
import { NotFound } from './features/not-found/not-found';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'Sign in · PolicyDesk' },
  {
    // A parent route without a component: its guard protects every child.
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard, title: 'Dashboard · PolicyDesk' },
      {
        path: 'clients',
        // Lazy loading: this code is a separate file, downloaded the first time someone opens /clients.
        loadComponent: () => import('./features/clients/client-list').then((m) => m.ClientList),
        title: 'Clients · PolicyDesk',
      },
      {
        // 'clients/new' must come BEFORE 'clients/:id', or "new" would be read as an id.
        path: 'clients/new',
        loadComponent: () => import('./features/clients/client-form').then((m) => m.ClientFormPage),
        canDeactivate: [unsavedChangesGuard],
        title: 'New client · PolicyDesk',
      },
      {
        path: 'clients/:id/edit',
        loadComponent: () => import('./features/clients/client-form').then((m) => m.ClientFormPage),
        canDeactivate: [unsavedChangesGuard],
        title: 'Edit client · PolicyDesk',
      },
      {
        path: 'clients/:id',
        loadComponent: () =>
          import('./features/clients/client-detail').then((m) => m.ClientDetailPage),
        title: 'Client · PolicyDesk',
      },
      {
        path: 'policies',
        loadComponent: () => import('./features/policies/policy-list').then((m) => m.PolicyList),
        title: 'Policies · PolicyDesk',
      },
      {
        path: 'policies/:id',
        loadComponent: () =>
          import('./features/policies/policy-detail').then((m) => m.PolicyDetailPage),
        title: 'Policy · PolicyDesk',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', component: NotFound, title: 'Not found · PolicyDesk' },
];
