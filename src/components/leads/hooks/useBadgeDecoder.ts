/**
 * Camera + PDF417 decode loop.
 *
 * Decoding happens on-device via zxing-wasm, so a scan needs no network and
 * costs nothing per badge. The loop is throttled rather than run per frame:
 * a phone held at a booth for an hour must not cook itself.
 *
 * Only PDF417 is requested. Badges often carry a second symbology, and
 * locking onto a QR code that encodes a URL would look like success while
 * producing no contact at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type DecoderState =
  | 'idle' | 'loading' | 'ready' | 'scanning' | 'denied' | 'unsupported' | 'error';

const DECODE_INTERVAL_MS = 125; // ~8fps

interface UseBadgeDecoderArgs {
  onDecode: (payload: string) => void;
}

export function useBadgeDecoder({ onDecode }: UseBadgeDecoderArgs) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lockedRef = useRef(false);

  const [state, setState] = useState<DecoderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    lockedRef.current = false;
    setTorchOn(false);
    setState('idle');
  }, []);

  const tick = useCallback(async () => {
    if (lockedRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const { readBarcodes } = await import('zxing-wasm/reader');
      const results = await readBarcodes(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        { formats: ['PDF417'], tryHarder: true }
      );
      const hit = results.find((r: any) => r?.text);
      if (hit && !lockedRef.current) {
        // Latch immediately: the interval can fire again while this await
        // resolves, and a double-fire would create two leads for one badge.
        lockedRef.current = true;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        onDecode(hit.text);
      }
    } catch {
      // A single bad frame is not a failure; the next tick tries again.
    }
  }, [onDecode]);

  const start = useCallback(async () => {
    setError(null);
    lockedRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setError('This browser cannot open the camera. Use manual entry.');
      return;
    }

    setState('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities | undefined;
      setTorchAvailable(Boolean(capabilities && 'torch' in capabilities && (capabilities as any).torch));

      setState('scanning');
      timerRef.current = setInterval(() => { void tick(); }, DECODE_INTERVAL_MS);
      void tick();
    } catch (err) {
      const name = (err as Error & { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setError('Camera access was blocked. Allow it in your browser settings, or use manual entry.');
      } else {
        setState('error');
        setError((err as Error).message || 'Could not start the camera');
      }
    }
  }, [tick]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as any);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false); // the device lied about supporting it
    }
  }, [torchOn]);

  // Releasing the camera on unmount is not optional: the phone's camera LED
  // stays lit otherwise, and users read that as the app spying on them.
  useEffect(() => stop, [stop]);

  return { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch };
}
