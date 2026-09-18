import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const decoder = {
  state: 'scanning' as string,
  error: null as string | null,
  videoRef: { current: null },
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  torchAvailable: true,
  torchOn: false,
  toggleTorch: vi.fn(),
};
let capturedOnDecode: ((p: string, format: string) => void) | null = null;

vi.mock('../hooks/useBadgeDecoder', () => ({
  useBadgeDecoder: ({ onDecode }: any) => { capturedOnDecode = onDecode; return decoder; },
}));

const decodeBadgeImage = vi.fn(async (): Promise<{ text: string; format: string } | null> => null);
vi.mock('../../../utils/badge/decodeBadge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  decodeBadgeImage: (blob: Blob) => decodeBadgeImage(blob),
}));

import { BadgeScanner } from '../BadgeScanner';

const setup = (props: any = {}) =>
  render(
    <BadgeScanner
      entity="Haute Brands"
      onCaptured={props.onCaptured ?? vi.fn()}
      onManualEntry={props.onManualEntry ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />
  );

describe('BadgeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decoder.state = 'scanning';
    decoder.error = null;
    decoder.torchAvailable = true;
  });

  it('keeps the active company visible so a rep never guesses where leads went', () => {
    setup();
    expect(screen.getByText(/Haute Brands/)).toBeInTheDocument();
  });

  it('passes the decoded payload up, already parsed', () => {
    const onCaptured = vi.fn();
    setup({ onCaptured });
    capturedOnDecode!('124649-907|Shamsher|Jessani|sjessani@aol.com', 'PDF417');
    expect(onCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        rawPayload: '124649-907|Shamsher|Jessani|sjessani@aol.com',
        format: 'PDF417',
        parsed: expect.objectContaining({
          fields: expect.objectContaining({ email: 'sjessani@aol.com' }),
        }),
      })
    );
  });

  it('offers manual entry when the camera is denied instead of dead-ending', () => {
    decoder.state = 'denied';
    decoder.error = 'Camera access was blocked.';
    const onManualEntry = vi.fn();
    setup({ onManualEntry });
    fireEvent.click(screen.getByRole('button', { name: /enter manually/i }));
    expect(onManualEntry).toHaveBeenCalled();
  });

  it('shows the camera error text rather than a blank frame', () => {
    decoder.state = 'denied';
    decoder.error = 'Camera access was blocked.';
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent('Camera access was blocked.');
  });

  it('hides the torch control on devices that do not support it', () => {
    decoder.torchAvailable = false;
    setup();
    expect(screen.queryByRole('button', { name: /torch/i })).not.toBeInTheDocument();
  });

  it('stops the camera when closed', () => {
    const onClose = vi.fn();
    setup({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close scanner/i }));
    expect(decoder.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BadgeScanner camera ownership', () => {
  beforeEach(() => { vi.clearAllMocks(); decoder.state = 'scanning'; decoder.error = null; });

  it('starts the camera once on mount and stops it on unmount', () => {
    const { unmount } = setup();
    expect(decoder.start).toHaveBeenCalledTimes(1);
    expect(decoder.stop).not.toHaveBeenCalled();
    unmount();
    expect(decoder.stop).toHaveBeenCalledTimes(1);
  });
});

describe('BadgeScanner symbologies and photo fallback', () => {
  beforeEach(() => { vi.clearAllMocks(); decoder.state = 'scanning'; decoder.error = null; });

  it('tells the rep which code types it reads, so a QR badge is not assumed unsupported', () => {
    setup();
    expect(screen.getByText(/PDF417.*QR/i)).toBeInTheDocument();
  });

  it('offers a photo fallback that works without the live-camera permission', async () => {
    // A rep who tapped "Don't Allow" once is otherwise locked out until they
    // dig through iOS settings. The photo picker never needs that grant.
    decodeBadgeImage.mockResolvedValue({ text: 'MECARD:N:Doe,Jane;EMAIL:j@d.com;;', format: 'QRCode' });
    const onCaptured = vi.fn();
    setup({ onCaptured });
    const input = screen.getByLabelText(/badge photo/i) as HTMLInputElement;
    expect(input.getAttribute('capture')).toBe('environment');
    const file = new File(['x'], 'badge.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith(expect.objectContaining({
      rawPayload: 'MECARD:N:Doe,Jane;EMAIL:j@d.com;;',
      format: 'QRCode',
    })));
    expect(decoder.stop).toHaveBeenCalled();
  });

  it('says so when the photo has no readable code instead of silently doing nothing', async () => {
    decodeBadgeImage.mockResolvedValue(null);
    const onCaptured = vi.fn();
    setup({ onCaptured });
    const input = screen.getByLabelText(/badge photo/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no barcode/i));
    expect(onCaptured).not.toHaveBeenCalled();
  });
});
