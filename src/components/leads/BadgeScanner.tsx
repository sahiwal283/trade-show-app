/**
 * Fullscreen badge viewfinder.
 *
 * The active company is pinned to the top of the frame on purpose: a rep
 * working two brands at one booth must never have to wonder which CRM the
 * last twenty leads went to.
 *
 * The photo fallback exists because the live viewfinder needs the browser's
 * camera grant and the receipt flow's picker does not: a rep who once tapped
 * "Don't Allow" can still capture a badge without a trip through iOS settings.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, Keyboard, Camera } from 'lucide-react';
import { useBadgeDecoder } from './hooks/useBadgeDecoder';
import { parseBadgePayload, ParsedBadge } from '../../utils/badge/parseBadgePayload';
import { decodeBadgeImage } from '../../utils/badge/decodeBadge';
import { haptics } from '../../utils/haptics';

export interface ScannedBadge {
  rawPayload: string;
  /** zxing format name (PDF417, QRCode, ...) or 'Manual'. */
  format: string;
  parsed: ParsedBadge;
}

interface BadgeScannerProps {
  entity: string;
  onCaptured: (badge: ScannedBadge) => void;
  onManualEntry: () => void;
  onClose: () => void;
}

export const BadgeScanner: React.FC<BadgeScannerProps> = ({
  entity, onCaptured, onManualEntry, onClose,
}) => {
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [decodingPhoto, setDecodingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch } =
    useBadgeDecoder({
      onDecode: (rawPayload, format) => {
        haptics.action();
        onCaptured({ rawPayload, format, parsed: parseBadgePayload(rawPayload) });
      },
    });

  // Symmetric start/stop so StrictMode's mount-unmount-mount and a real
  // unmount both leave the camera released.
  useEffect(() => { void start(); return stop; }, [start, stop]);

  const handleClose = () => { stop(); onClose(); };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same photo can be retried
    if (!file) return;
    setPhotoError(null);
    setDecodingPhoto(true);
    try {
      const hit = await decodeBadgeImage(file);
      if (!hit) {
        setPhotoError('No barcode found in that photo. Get closer with the code flat and well lit, or enter manually.');
        return;
      }
      stop();
      haptics.action();
      onCaptured({ rawPayload: hit.text, format: hit.format, parsed: parseBadgePayload(hit.text) });
    } finally {
      setDecodingPhoto(false);
    }
  };

  const cameraProblem = state === 'denied' || state === 'unsupported' || state === 'error';
  const alertText = photoError ?? (cameraProblem ? error : null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-2 p-4 text-white">
        <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
          Scanning for - <strong>{entity}</strong>
        </span>
        <button
          onClick={handleClose}
          aria-label="Close scanner"
          className="rounded-full bg-white/15 p-2 focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* A visible target box. Tall enough for a square QR or Data Matrix,
            wide enough for a PDF417 strip, so neither gets framed wrong. */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-56 max-h-[60%] -translate-y-1/2 rounded-lg border-2 border-white/70" />
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
          Reads PDF417 · QR · Data Matrix · Aztec · Code 128 / 39
        </p>
      </div>

      {alertText && (
        <div className="bg-red-900/90 p-4 text-sm text-white" role="alert">
          {alertText}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 p-6">
        {torchAvailable && (
          <button
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white"
          >
            {torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
            Torch
          </button>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Badge photo"
          className="hidden"
          onChange={(e) => { void handlePhoto(e); }}
        />
        <button
          onClick={() => photoInputRef.current?.click()}
          disabled={decodingPhoto}
          className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white disabled:opacity-50"
        >
          <Camera className="h-5 w-5" />
          {decodingPhoto ? 'Reading…' : 'Take photo'}
        </button>
        <button
          onClick={() => { stop(); onManualEntry(); }}
          className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white"
        >
          <Keyboard className="h-5 w-5" />
          Enter manually
        </button>
      </div>
    </div>
  );
};
