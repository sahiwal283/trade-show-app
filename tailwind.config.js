import colors from 'tailwindcss/colors';

const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, token(`${name}-${step}`)]),
  );

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // The palette is Executive Navy + Electric Blue. Tokens live in
        // src/theme/theme.css; every family below either reads a token or is
        // folded into a neighbour, so no off-palette hue can appear by using
        // a default Tailwind class (role badges store class names in the
        // database, so this has to hold for classes not in the source too).

        // Primary: electric blue. Legacy blue-* utilities are the same colour.
        brand: scale('brand'),
        blue: scale('brand'),
        // Second stop of brand gradients (CTA, avatars, progress bars)
        grad: scale('grad'),
        // Neutrals: one cool slate ramp. stone-900 is body text, stone-50 the
        // page background.
        stone: scale('stone'),
        gray: scale('stone'),
        slate: scale('stone'),
        zinc: scale('stone'),
        neutral: scale('stone'),
        // Success: one emerald ("approved", "done", positive figures)
        accent: scale('accent'),
        emerald: scale('accent'),
        green: scale('accent'),
        // Warning is amber; yellow is not a separate colour here
        yellow: colors.amber,
        // Danger is red
        rose: colors.red,
        // Categorical hues, kept cool so they sit beside the blue: purple
        // reads as violet, fuchsia as pink
        purple: colors.violet,
        fuchsia: colors.pink,
        // Masthead gradient stops (dashboard hero, report bands, modal headers)
        hero: { 1: token('hero-1'), 2: token('hero-2'), 3: token('hero-3') },
        // Sidebar surface and its nav states
        side: {
          bg: token('side-bg'),
          border: token('side-border'),
          text: token('side-text'),
          muted: token('side-muted'),
          strong: token('side-strong'),
          hover: token('side-hover'),
          'hover-text': token('side-hover-text'),
          active: token('side-active'),
          'active-text': token('side-active-text'),
          'active-icon': token('side-active-icon'),
          'ind-1': token('side-ind-1'),
          'ind-2': token('side-ind-2'),
        },
      },
      fontFamily: {
        // Self-hosted pairing (see src/index.css @font-face): Inter carries
        // body text, Instrument Sans gives headings and hero numerals their
        // refined grotesque character.
        sans: [
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        display: [
          '"Instrument Sans"',
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        // One radius personality: cards = rounded-card (14px), controls = rounded-lg
        card: '0.875rem',
      },
      boxShadow: {
        // Layered, realistic elevation (tinted slate, not gray blobs)
        'elevation-1':
          '0 1px 1px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        'elevation-2':
          '0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 12px -2px rgba(15, 23, 42, 0.10)',
        'elevation-3':
          '0 2px 4px rgba(15, 23, 42, 0.05), 0 12px 32px -8px rgba(15, 23, 42, 0.18)',
        // Colored depth for the gradient brand CTA
        brand: '0 4px 14px -3px rgb(var(--c-brand-600) / 0.40)',
        'brand-lg':
          '0 2px 4px rgb(var(--c-brand-600) / 0.15), 0 8px 24px -6px rgb(var(--c-brand-600) / 0.45)',
      },
    },
  },
  plugins: [],
};
