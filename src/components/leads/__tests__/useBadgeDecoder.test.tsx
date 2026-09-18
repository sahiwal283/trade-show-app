import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const readBarcodes = vi.fn(async () => []);
vi.mock('zxing-wasm/reader', () => ({ readBarcodes, prepareZXingModule: vi.fn() }));

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

// The hook's start() only wires up a <video> element when one is already
// attached to videoRef (the literal brief guard: `if (videoRef.current)`).
// In real usage the consumer's rendered <video ref={videoRef}> mounts
// before start() is ever called; a bare renderHook() never renders any
// JSX, so tests that exercise the decode loop must attach a real <video>
// to the ref themselves, exactly like a consuming component would.
const attachedVideos: HTMLVideoElement[] = [];
function attachVideo(videoRef: { current: HTMLVideoElement | null }) {
  const video = document.createElement('video');
  document.body.appendChild(video);
  attachedVideos.push(video);
  videoRef.current = video;
}

describe('useBadgeDecoder', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    attachedVideos.splice(0).forEach((v) => v.remove());
  });

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

  it('asks the decoder to try harder, since badges are read at booth distance', async () => {
    mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(readBarcodes).toHaveBeenCalled());
    expect((readBarcodes.mock.calls[0] as any)[1]).toMatchObject({ tryHarder: true });
  });

  it('hands the decoded payload to onDecode exactly once per lock', async () => {
    mockCamera();
    readBarcodes.mockResolvedValue([{ text: 'RAW|PAYLOAD', format: 'PDF417', isValid: true }] as any);
    const onDecode = vi.fn();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith('RAW|PAYLOAD', 'PDF417'));
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

describe('useBadgeDecoder camera lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    attachedVideos.splice(0).forEach((v) => v.remove());
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('keeps start() stable when the consumer passes a fresh onDecode each render', () => {
    // BadgeScanner passes an inline arrow. If start() changed identity with
    // it, the consumer's mount effect would re-run every render and reopen
    // the camera in a loop, leaking a live stream per iteration.
    mockCamera();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: (p: string) => void }) => useBadgeDecoder({ onDecode: cb }),
      { initialProps: { cb: vi.fn() } }
    );
    const first = result.current.start;
    rerender({ cb: vi.fn() });
    expect(result.current.start).toBe(first);
  });

  it('delivers the payload to the latest onDecode, not the one from first render', async () => {
    mockCamera();
    readBarcodes.mockResolvedValue([{ text: 'LATE|PAYLOAD', format: 'PDF417' }] as any);
    const stale = vi.fn();
    const fresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: (p: string) => void }) => useBadgeDecoder({ onDecode: cb }),
      { initialProps: { cb: stale } }
    );
    attachVideo(result.current.videoRef);
    rerender({ cb: fresh });
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(fresh).toHaveBeenCalledWith('LATE|PAYLOAD', 'PDF417'));
    expect(stale).not.toHaveBeenCalled();
  });

  it('releases a stream that arrives after stop() was already called', async () => {
    // Unmount (or StrictMode's mount/unmount/mount) can run stop() while
    // getUserMedia is still waiting on the permission prompt. That late
    // stream must be stopped on arrival, or the camera LED stays lit forever.
    let resolveStream: (s: unknown) => void = () => {};
    const track = { stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(() => new Promise((r) => { resolveStream = r; })),
    };
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);

    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.start(); });
    act(() => { result.current.stop(); });
    await act(async () => { resolveStream(stream); await pending; });

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.videoRef.current!.srcObject).toBeNull();
    expect(result.current.state).toBe('idle');
  });

  it('detaches the stream from the <video> on stop so iOS drops the camera indicator', async () => {
    const { stream } = mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    expect(result.current.videoRef.current!.srcObject).toBe(stream);
    act(() => { result.current.stop(); });
    expect(result.current.videoRef.current!.srcObject).toBeNull();
  });

  it('never runs two decode passes at once when a frame takes longer than the interval', async () => {
    // tryHarder on a 1080p frame can take well over 125ms on a phone. Without
    // an in-flight guard the interval stacks decodes and the UI freezes.
    mockCamera();
    readBarcodes.mockImplementation(() => new Promise(() => {}) as any);
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    await new Promise((r) => setTimeout(r, 450));
    expect(readBarcodes).toHaveBeenCalledTimes(1);
    act(() => { result.current.stop(); });
  });

  it('releases the camera when the app is backgrounded and reopens it on return', async () => {
    // iOS kills the capture session when a PWA goes to the background and
    // hands back a frozen or black <video>. Re-acquiring on return is the
    // only way to get frames again.
    const { track } = mockCamera();
    const getUserMedia = vi.mocked((navigator as any).mediaDevices.getUserMedia);
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('scanning');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(track.stop).toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state).toBe('scanning'));
    act(() => { result.current.stop(); });
  });

  it('does not reopen the camera on return if the user had already stopped it', async () => {
    mockCamera();
    const getUserMedia = vi.mocked((navigator as any).mediaDevices.getUserMedia);
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await new Promise((r) => setTimeout(r, 50));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe('useBadgeDecoder symbologies', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { attachedVideos.splice(0).forEach((v) => v.remove()); });

  it('scans QR and the other badge formats, not only PDF417', async () => {
    mockCamera();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode: vi.fn() }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(readBarcodes).toHaveBeenCalled());
    const formats: string[] = (readBarcodes.mock.calls[0] as any)[1].formats;
    expect(formats).toEqual(expect.arrayContaining(['PDF417', 'QRCode', 'DataMatrix']));
    act(() => { result.current.stop(); });
  });

  it('tells onDecode which symbology produced the payload', async () => {
    mockCamera();
    readBarcodes.mockResolvedValue([{ text: 'https://reg.example.com/a/1', format: 'QRCode', isValid: true }] as any);
    const onDecode = vi.fn();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith('https://reg.example.com/a/1', 'QRCode'));
  });

  it('picks the PDF417 over a QR code decoded in the same frame', async () => {
    mockCamera();
    readBarcodes.mockResolvedValue([
      { text: 'https://reg.example.com/a/1', format: 'QRCode', isValid: true },
      { text: '1|Ann|Lee|Acme Inc|a@acme.com', format: 'PDF417', isValid: true },
    ] as any);
    const onDecode = vi.fn();
    const { result } = renderHook(() => useBadgeDecoder({ onDecode }));
    attachVideo(result.current.videoRef);
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith('1|Ann|Lee|Acme Inc|a@acme.com', 'PDF417'));
  });
});
