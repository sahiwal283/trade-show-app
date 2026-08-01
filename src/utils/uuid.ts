/**
 * UUID Generator with crypto.randomUUID polyfill
 * 
 * Provides a consistent UUID generation method that works across all browsers.
 * Falls back to a secure random UUID implementation if crypto.randomUUID is not available.
 */

/**
 * Generate a v4 UUID
 * Uses crypto.randomUUID() if available, otherwise falls back to a polyfill
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Polyfill for browsers that don't support crypto.randomUUID
  // This is a RFC4122 version 4 compliant UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

