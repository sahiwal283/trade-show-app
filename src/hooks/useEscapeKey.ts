import { useEffect } from 'react';

/**
 * Close a modal/sheet on Escape. Standard escape-route affordance for
 * keyboard users (every dialog needs a non-pointer way out).
 */
export function useEscapeKey(onEscape: (() => void) | null | undefined, active: boolean = true): void {
  useEffect(() => {
    if (!active || !onEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, active]);
}
