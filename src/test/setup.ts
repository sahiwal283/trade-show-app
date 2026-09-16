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

// Mock canvas 2D context. happy-dom does not implement <canvas> rendering
// (getContext('2d') returns null), but the badge-scan decode loop draws
// video frames to an off-screen canvas before handing pixel data to the
// WASM decoder, so tests need a non-null stub to exercise that path.
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

// Mock video element dimensions. happy-dom never decodes real media, so
// videoWidth/videoHeight stay 0 unless stubbed — tests that open a mocked
// camera stream need non-zero dimensions to reach the frame-capture path.
Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
  configurable: true,
  get: () => 640,
});
Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
  configurable: true,
  get: () => 480,
});

// Relax happy-dom's strict `srcObject` setter, which rejects anything that
// isn't a real `MediaStream` instance. Camera tests assign a plain mock
// stream object (real `getUserMedia` always returns a real MediaStream, so
// this validation never matters outside tests).
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

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
};

