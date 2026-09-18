import { describe, it, expect, vi } from 'vitest';

const prepareZXingModule = vi.fn();
const readBarcodes = vi.fn(async () => []);
vi.mock('zxing-wasm/reader', () => ({ prepareZXingModule, readBarcodes }));

import { loadBadgeReader } from '../zxingReader';

// The loader memoises its module promise, so prepareZXingModule is called
// once for the whole file; every test reads that single recorded call.
describe('loadBadgeReader', () => {
  it('serves the WASM binary from the app origin, never a third-party CDN', async () => {
    // zxing-wasm's default locateFile points at fastly.jsdelivr.net. A rep in
    // a convention hall with no signal (or a blocked CDN) would then get a
    // scanner that looks alive but never decodes anything.
    await loadBadgeReader();
    const options = prepareZXingModule.mock.calls[0][0];
    const url: string = options.overrides.locateFile(
      'zxing_reader.wasm',
      'https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/reader/'
    );
    expect(url).not.toMatch(/jsdelivr|cdn/i);
    expect(url).toMatch(/zxing_reader.*\.wasm$/);
  });

  it('leaves non-wasm files to the library default', async () => {
    await loadBadgeReader();
    const options = prepareZXingModule.mock.calls[0][0];
    expect(options.overrides.locateFile('other.data', '/prefix/')).toBe('/prefix/other.data');
  });

  it('returns the reader function', async () => {
    expect(await loadBadgeReader()).toBe(readBarcodes);
  });
});
