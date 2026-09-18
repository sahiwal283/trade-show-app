/**
 * Integration: BadgeScanner + the real useBadgeDecoder, under StrictMode as
 * main.tsx renders it. Guards against the mount-effect loop that reopened
 * the camera on every render and leaked every stream but the last.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';

vi.mock('zxing-wasm/reader', () => ({
  prepareZXingModule: vi.fn(),
  readBarcodes: vi.fn(async () => []),
}));

import { BadgeScanner } from '../BadgeScanner';

type MockTrack = { stop: ReturnType<typeof vi.fn>; getCapabilities: () => object; applyConstraints: ReturnType<typeof vi.fn> };

describe('BadgeScanner camera lifecycle (real decoder, StrictMode)', () => {
  const tracks: MockTrack[] = [];

  beforeEach(() => {
    tracks.splice(0);
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(async () => {
        const track: MockTrack = { stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
        tracks.push(track);
        return { getTracks: () => [track], getVideoTracks: () => [track] };
      }),
    };
  });

  it('opens the camera a bounded number of times and leaves no live track after unmount', async () => {
    const getUserMedia = vi.mocked((navigator as any).mediaDevices.getUserMedia);
    const { unmount } = render(
      <StrictMode>
        <BadgeScanner entity="Haute Brands" onCaptured={vi.fn()} onManualEntry={vi.fn()} onClose={vi.fn()} />
      </StrictMode>
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    // Give a runaway effect loop time to show itself.
    await new Promise((r) => setTimeout(r, 400));

    // StrictMode mounts twice on purpose; anything beyond that is the loop.
    expect(getUserMedia.mock.calls.length).toBeLessThanOrEqual(2);
    const live = tracks.filter((t) => t.stop.mock.calls.length === 0);
    expect(live).toHaveLength(1);

    unmount();
    expect(tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
  });
});
