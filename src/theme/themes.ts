/**
 * Colour themes on offer while the production palette is being chosen.
 * The colours themselves live in themes.css, keyed by the same ids; index.html
 * repeats the ids and storage key so the theme is set before first paint.
 */

export type ThemeId = 'current' | 'navy-blue' | 'navy-teal' | 'indigo-slate';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  /** Preview chips, in order: sidebar, primary, page background. */
  swatches: [string, string, string];
  /** Browser/OS chrome colour (the theme-color meta tag). */
  chrome: string;
}

export const THEMES: ThemeOption[] = [
  {
    id: 'navy-blue',
    name: 'Executive Navy + Electric Blue',
    description: 'Polished enterprise',
    swatches: ['#111827', '#2563EB', '#F8FAFC'],
    chrome: '#111827',
  },
  {
    id: 'navy-teal',
    name: 'Navy + Teal',
    description: 'More distinctive',
    swatches: ['#0F172A', '#0D9488', '#F8FAFC'],
    chrome: '#0F172A',
  },
  {
    id: 'indigo-slate',
    name: 'Deep Indigo + Slate',
    description: 'Modern SaaS',
    swatches: ['#1E1B4B', '#4F46E5', '#F8FAFC'],
    chrome: '#1E1B4B',
  },
  {
    id: 'current',
    name: 'Current',
    description: "Today's look, for comparison",
    swatches: ['#FFFFFF', '#2563EB', '#FAFAF9'],
    chrome: '#3B82F6',
  },
];

export const DEFAULT_THEME: ThemeId = 'navy-blue';
const STORAGE_KEY = 'argo_theme';

const isThemeId = (value: unknown): value is ThemeId => THEMES.some((theme) => theme.id === value);

export function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Recolour the app now; the choice is remembered on this device. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  const chrome = THEMES.find((theme) => theme.id === id)?.chrome;
  if (chrome) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode): the theme still applies for this visit.
  }
}
