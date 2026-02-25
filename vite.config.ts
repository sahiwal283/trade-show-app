import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path when served under platform (e.g. /apps/trade-show). Default '/' preserves current behavior.
const APP_BASE_PATH = process.env.VITE_APP_BASE_PATH || '/';

// https://vitejs.dev/config/
export default defineConfig({
  base: APP_BASE_PATH,
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
        'backend/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
