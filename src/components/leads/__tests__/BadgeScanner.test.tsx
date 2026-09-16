import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
let capturedOnDecode: ((p: string) => void) | null = null;

vi.mock('../hooks/useBadgeDecoder', () => ({
  useBadgeDecoder: ({ onDecode }: any) => { capturedOnDecode = onDecode; return decoder; },
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
    capturedOnDecode!('124649-907|Shamsher|Jessani|sjessani@aol.com');
    expect(onCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        rawPayload: '124649-907|Shamsher|Jessani|sjessani@aol.com',
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
