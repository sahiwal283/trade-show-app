/**
 * Which deployment this bundle was built for.
 *
 * Set at build time via VITE_APP_ENV:
 *   - `.env.development` (used by `npm run dev` and `npm run build:sandbox`) sets `sandbox`
 *   - `.env.production` (used by `npm run build:production`) does not set it at all
 *
 * Deliberately fail-closed: anything other than the literal string `sandbox` is
 * treated as production. A missing or misspelled var hides the badge rather than
 * risking a "Sandbox" label on the production app.
 */
export const IS_SANDBOX = import.meta.env.VITE_APP_ENV === 'sandbox';
