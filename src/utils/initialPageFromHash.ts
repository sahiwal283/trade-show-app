/**
 * The page App mounts on first paint for a cold deep link. A push or email
 * click lands with no in-app onNavigate call, so the hash alone picks it:
 *  - `#expense=<id>`                 → expenses (ExpenseSubmission reads it)
 *  - `#expenses-event=<id>`          → expenses, filtered to that show
 *  - `#event=<id>&tab=my|samples`    → checklist (TradeShowChecklist reads it)
 *  - `#users`                        → settings (AdminSettings opens Users)
 *  - `#booths`, `#leads`             → booth inventory, badge scans
 *  - anything else, incl. a bare `#event=<id>` → dashboard (unchanged)
 */
export type InitialPage = 'expenses' | 'checklist' | 'settings' | 'booths' | 'leads' | 'dashboard';

export function initialPageFromHash(hash: string): InitialPage {
  if (hash.startsWith('#expense=') || hash.startsWith('#expenses-event=')) return 'expenses';
  if (hash === '#users') return 'settings';
  if (hash === '#booths') return 'booths';
  if (hash === '#leads') return 'leads';
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const tab = params.get('tab');
  if (params.has('event') && (tab === 'my' || tab === 'samples')) return 'checklist';
  return 'dashboard';
}
