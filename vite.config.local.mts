// Local visual-QA config: proxy /api to the local backend so the app runs
// same-origin (no CORS). Not used by any build script — safe to delete.
import { mergeConfig, defineConfig } from 'vite';
import baseConfig from './vite.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      proxy: {
        '/api': 'http://localhost:5100',
      },
    },
  })
);
