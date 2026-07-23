/**
 * Haptic feedback for key interactions (tab taps, capture, copy, success).
 * Uses the Vibration API — supported on Android Chrome; iOS Safari has no
 * web vibration API, so calls are silently ignored there. Respects
 * prefers-reduced-motion as a proxy for "calm mode".
 */

type HapticPattern = number | number[];

const PATTERNS = {
  /** Light tick — navigation taps, toggles */
  tap: 10,
  /** Medium — camera capture, primary action begins */
  action: 20,
  /** Double pulse — success (saved, copied) */
  success: [15, 60, 20] as number[],
  /** Firm double — warning/destructive confirm shown */
  warning: [30, 80, 30] as number[],
};

function vibrate(pattern: HapticPattern): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(pattern);
  } catch {
    // Vibration is best-effort decoration — never let it throw.
  }
}

export const haptics = {
  tap: () => vibrate(PATTERNS.tap),
  action: () => vibrate(PATTERNS.action),
  success: () => vibrate(PATTERNS.success),
  warning: () => vibrate(PATTERNS.warning),
};
