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
  esbuild: {
    // Strip console noise from production bundles; keep console.error/warn.
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Stable vendor chunks cache independently of app releases.
        manualChunks: {
          react: ['react', 'react-dom'],
          icons: ['lucide-react'],
          offline: ['dexie'],
        },
      },
    },
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
