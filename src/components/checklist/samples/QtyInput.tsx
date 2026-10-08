import React from 'react';
import { MAX_SAMPLE_QTY } from '../../../utils/sampleRequestApi';

interface Props {
  /** Accessible name, e.g. "Mango singles". The column header is the visible label. */
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

/**
 * One quantity cell. Zero shows as an empty cell with a pale placeholder, so a table of mostly-zero rows
 * stays quiet and the requested quantities stand out. Focusing selects the value so typing replaces it.
 */
export const QtyInput: React.FC<Props> = ({ label, value, disabled, onChange }) => (
  <input
    type="number" inputMode="numeric" min={0} max={MAX_SAMPLE_QTY} step={1}
    aria-label={label}
    value={value > 0 ? value : ''}
    placeholder={disabled ? '–' : '0'}
    disabled={disabled}
    onFocus={(e) => e.currentTarget.select()}
    onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
    className={`qty-input ${value > 0 ? 'qty-input-filled' : ''}`}
  />
);
