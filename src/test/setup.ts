import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Mock window.alert and window.confirm
global.alert = vi.fn();
global.confirm = vi.fn(() => true);

// ---------------------------------------------------------------------
// Badge-scanner test accommodations (src/components/leads/hooks/useBadgeDecoder)
//
// happy-dom does not implement real <canvas> rendering or <video> media
// playback, and its `srcObject` setter is stricter than real browsers'.
// The three patches below exist ONLY to let the badge-scan decode loop
// (canvas frame capture -> zxing-wasm) run under test. If you are
// debugging an unrelated canvas/video test and something behaves oddly,
// look here first. Each patch feature-detects first and only installs
// itself when the real/native behavior is actually missing, so it will
// get out of the way automatically if a future happy-dom version adds
// real support.
// ---------------------------------------------------------------------

// 1) Canvas 2D context. happy-dom's getContext('2d') returns null, but the
//    decode loop draws video frames to an off-screen canvas before handing
//    pixel data to the WASM decoder.
const nativeCanvasProbe = document.createElement('canvas');
const hasNativeCanvasContext = Boolean(nativeCanvasProbe.getContext?.('2d'));
if (!hasNativeCanvasContext) {
  const canvasContext2DStub = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(width, 0) * Math.max(height, 0) * 4),
      width,
      height,
      colorSpace: 'srgb' as PredefinedColorSpace,
    })),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContext2DStub) as any;
}

// 2) Video element dimensions. happy-dom never decodes real media, so
//    videoWidth/videoHeight stay 0/undefined — the decode loop treats that
//    as "no frame yet" and never reaches the WASM decoder.
const nativeVideoProbe = document.createElement('video');
if (!nativeVideoProbe.videoWidth) {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => 480,
  });
}

// 3) `srcObject` validation. happy-dom's real setter throws unless the
//    assigned value is `instanceof MediaStream`; camera tests assign a
//    plain mock stream object instead (real `getUserMedia` always returns
//    a real MediaStream, so this relaxation never matters outside tests).
let srcObjectAcceptsPlainObjects = true;
try {
  document.createElement('video').srcObject = {} as any;
} catch {
  srcObjectAcceptsPlainObjects = false;
}
if (!srcObjectAcceptsPlainObjects) {
  const srcObjectValues = new WeakMap<HTMLMediaElement, unknown>();
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    get() {
      return srcObjectValues.get(this) ?? null;
    },
    set(value) {
      srcObjectValues.set(this, value);
    },
  });
}

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
};

