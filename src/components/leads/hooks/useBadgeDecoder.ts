/**
 * Camera + PDF417 decode loop.
 *
 * Decoding happens on-device via zxing-wasm, so a scan needs no network and
 * costs nothing per badge. The loop is throttled rather than run per frame:
 * a phone held at a booth for an hour must not cook itself.
 *
 * Symbology selection lives in utils/badge/decodeBadge: several formats are
 * requested, and when a frame yields more than one hit the PDF417 wins over
 * a QR code, which on a badge is usually just a URL.
 *
 * Camera ownership rules, learned the hard way:
 *  - start() and stop() are referentially stable. The consumer passes an
 *    inline onDecode; if start() changed with it, the consumer's mount effect
 *    re-ran every render and reopened the camera in a loop, leaking a live
 *    stream per iteration. That is what kept the iPhone camera indicator lit
 *    after the scanner closed.
 *  - Every stream is tagged with the generation that requested it. A stream
 *    that arrives after stop() or a newer start() is stopped on arrival.
 *  - stop() detaches the stream from the <video>. iOS keeps the camera
 *    indicator on while a stopped stream is still attached to an element.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBadgeReader } from '../../../utils/badge/zxingReader';
import { READER_OPTIONS, pickDecodeHit } from '../../../utils/badge/decodeBadge';

export type DecoderState =
  | 'idle' | 'loading' | 'ready' | 'scanning' | 'denied' | 'unsupported' | 'error';

const DECODE_INTERVAL_MS = 125; // ~8fps

interface UseBadgeDecoderArgs {
  onDecode: (payload: string, format: string) => void;
}

export function useBadgeDecoder({ onDecode }: UseBadgeDecoderArgs) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lockedRef = useRef(false);
  const decodingRef = useRef(false);
  const generationRef = useRef(0);
  // "The user wants the camera on." Survives a background release so the
  // stream can be re-acquired when the app returns to the foreground.
  const wantedRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const [state, setState] = useState<DecoderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Drops the current stream and invalidates any start() still in flight.
  const release = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      try { video.pause(); } catch { /* not playing */ }
      video.srcObject = null;
    }
    lockedRef.current = false;
    decodingRef.current = false;
    setTorchOn(false);
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    release();
    setState('idle');
  }, [release]);

  const tick = useCallback(async () => {
    if (lockedRef.current || decodingRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    decodingRef.current = true;
    try {
      const readBarcodes = await loadBadgeReader();
      const results = await readBarcodes(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
        READER_OPTIONS
      );
      const hit = pickDecodeHit(results);
      if (hit && !lockedRef.current) {
        // Latch immediately: the interval can fire again while this await
        // resolves, and a double-fire would create two leads for one badge.
        lockedRef.current = true;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        onDecodeRef.current(hit.text, hit.format);
      }
    } catch {
      // A single bad frame is not a failure; the next tick tries again.
    } finally {
      decodingRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    release(); // an earlier stream must never outlive this call
    wantedRef.current = true;
    const generation = generationRef.current;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setError('This browser cannot open the camera. Use manual entry.');
      return;
    }

    setState('loading');
    void loadBadgeReader().catch(() => undefined); // overlap WASM fetch with the permission prompt
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      });
      if (generation !== generationRef.current) {
        // stop() or a newer start() won the race; this stream is an orphan.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
      if (generation !== generationRef.current) return;
      const name = (err as Error & { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setError('Camera access was blocked. Allow it in your browser settings, or use manual entry.');
      } else {
        setState('error');
        setError((err as Error).message || 'Could not start the camera');
      }
    }
  }, [release, tick]);

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

  // iOS tears down the capture session when a PWA goes to the background and
  // hands back a frozen or black <video>. Release on hide, re-acquire on show.
  useEffect(() => {
    const onVisibility = () => {
      if (!wantedRef.current) return;
      if (document.visibilityState === 'hidden') release();
      else if (!streamRef.current) void start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [release, start]);

  // Releasing the camera on unmount is not optional: the phone's camera LED
  // stays lit otherwise, and users read that as the app spying on them.
  useEffect(() => stop, [stop]);

  return { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch };
}
