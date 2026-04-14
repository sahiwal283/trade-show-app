/**
 * Normalize credentials before login API calls.
 * - Trims leading/trailing spaces (common from paste / mobile autofill).
 * - Username is case-insensitive on the server; email autofill is accepted as the login id.
 */
export function normalizeLoginUsername(username: string): string {
  return username.trim();
}

export function normalizeLoginPassword(password: string): string {
  return password.trim();
}
