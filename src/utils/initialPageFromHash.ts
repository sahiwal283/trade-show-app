/**
 * The page App mounts on first paint for a cold deep link. A push or email
 * click lands with no in-app onNavigate call, so the hash alone picks it:
 *  - `#expense=<id>`                 → expenses (ExpenseSubmission reads it)
 *  - `#event=<id>&tab=my|samples`    → checklist (TradeShowChecklist reads it)
 *  - anything else, incl. a bare `#event=<id>` → dashboard (unchanged)
 */
export function initialPageFromHash(hash: string): 'expenses' | 'checklist' | 'dashboard' {
  if (hash.startsWith('#expense=')) return 'expenses';
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const tab = params.get('tab');
  if (params.has('event') && (tab === 'my' || tab === 'samples')) return 'checklist';
  return 'dashboard';
}
