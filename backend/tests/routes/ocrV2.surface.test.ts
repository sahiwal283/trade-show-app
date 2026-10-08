import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
}));

import router from '../../src/routes/ocrV2';

const surface = (router as any).stack
  .filter((layer: any) => layer.route)
  .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
  .sort();

describe('ocr v2 route surface', () => {
  it('keeps receipt processing and correction capture', () => {
    expect(surface).toContain('POST /process');
    expect(surface).toContain('POST /corrections');
  });

  it('no longer exposes the training read endpoints', () => {
    expect(surface).toEqual(['GET /config', 'POST /corrections', 'POST /process']);
  });
});
