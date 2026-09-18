/**
 * zxing-wasm reader, configured to load its WASM binary from this app's own
 * origin.
 *
 * The library's default locateFile points at fastly.jsdelivr.net. In a
 * convention hall with no signal, or behind a network that blocks CDNs, that
 * produces a scanner that opens the camera and looks alive but never decodes
 * a single badge. Bundling the binary through Vite makes the first decode
 * cost one same-origin fetch that is cached with the rest of the build.
 */

import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

type ReaderModule = typeof import('zxing-wasm/reader');
type ReadBarcodes = ReaderModule['readBarcodes'];

let readerPromise: Promise<ReadBarcodes> | null = null;

export function loadBadgeReader(): Promise<ReadBarcodes> {
  if (!readerPromise) {
    readerPromise = import('zxing-wasm/reader').then((mod) => {
      // fireImmediately starts the WASM fetch now, so it overlaps the camera
      // permission prompt instead of delaying the first decode after it.
      const warm = mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? wasmUrl : prefix + path,
        },
        fireImmediately: true,
      });
      // A failed warm-up surfaces on the first readBarcodes call instead.
      Promise.resolve(warm).catch(() => undefined);
      return mod.readBarcodes;
    });
    readerPromise.catch(() => { readerPromise = null; }); // allow a retry
  }
  return readerPromise;
}
