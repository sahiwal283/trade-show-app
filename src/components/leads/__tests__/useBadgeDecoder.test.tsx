import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const readBarcodes = vi.fn(async () => []);
vi.mock('zxing-wasm/reader', () => ({ readBarcodes }));

import { useBadgeDecoder } from '../hooks/useBadgeDecoder';

function mockCamera(overrides: Partial<MediaTrackCapabilities> = {}) {
  const track = {
    stop: vi.fn(),
    getCapabilities: () => ({ torch: true, ...overrides }),
    applyConstraints: vi.fn(async () => {}),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  (navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => stream) };
  return { track, stream };
}

describe('useBadgeDecoder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports denied — not a generic error — when the user refuses the camera', async () => {
    // These need different UI: denied tells the user how to re-grant
    // permission, error offers a retry.
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(async () => {
        const err: any = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      }),
    };
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.state).toBe('denied'));
  });

  it('reports unsupported when the browser has no camera API at all', async () => {
    delete (navigator as any).mediaDevices;
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.state).toBe('unsupported'));
  });

  it('asks for the rear camera, because badges are scanned away from the user', async () => {
    mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    const constraints = vi.mocked((navigator as any).mediaDevices.getUserMedia).mock.calls[0][0];
    expect(JSON.stringify(constraints)).toContain('environment');
  });

  it('only decodes PDF417, so a stray QR code on the badge cannot win', async () => {
    mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(readBarcodes).toHaveBeenCalled());
    expect(readBarcodes.mock.calls[0][1]).toMatchObject({ formats: ['PDF417'] });
  });

  it('hands the decoded payload to onDecode exactly once per lock', async () => {
    mockCamera();
    readBarcodes.mockResolvedValue([{ text: 'RAW|PAYLOAD', format: 'PDF417', isValid: true }] as any);
    const onDecode = vi.fn();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith('RAW|PAYLOAD'));
    expect(onDecode).toHaveBeenCalledTimes(1);
  });

  it('releases the camera on stop so the phone LED goes out', async () => {
    const { track } = mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });
    expect(track.stop).toHaveBeenCalled();
  });

  it('exposes torch only when the device actually supports it', async () => {
    mockCamera({ torch: undefined } as any);
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(result.current.torchAvailable).toBe(false));
  });
});
