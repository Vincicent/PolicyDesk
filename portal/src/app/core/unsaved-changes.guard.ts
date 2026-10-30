import { CanDeactivateFn } from '@angular/router';

/** A page that can say "I have changes you'd lose". */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** canDeactivate guard: asks before leaving a page with unsaved changes. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) =>
  !page.hasUnsavedChanges() || confirm('You have unsaved changes. Leave this page anyway?');
