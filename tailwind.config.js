/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand blue (existing #2563eb family)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Accent green (existing gradient endpoint, emerald family)
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b9',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },
      fontFamily: {
        // Same system stack as body, but a named token so headings can opt
        // into tighter, heavier display styling consistently.
        display: [
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
        brand: '0 4px 14px -3px rgba(37, 99, 235, 0.40)',
        'brand-lg':
          '0 2px 4px rgba(37, 99, 235, 0.15), 0 8px 24px -6px rgba(37, 99, 235, 0.45)',
      },
    },
  },
  plugins: [],
};
