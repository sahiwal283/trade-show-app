import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectMenu } from '../SelectMenu';

const OPTIONS = [
  { value: 'a', label: 'Alpha', description: 'First', tag: 'Live now', tagEmphasis: true },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

const setup = (props: Partial<React.ComponentProps<typeof SelectMenu>> = {}) => {
  const onChange = vi.fn();
  render(
    <>
      <span id="lbl">Event</span>
      <SelectMenu id="pick" labelledBy="lbl" value="" onChange={onChange} options={OPTIONS} placeholder="Select an event" {...props} />
    </>
  );
  return { onChange, trigger: screen.getByRole('combobox', { name: /event/i }) };
};

describe('SelectMenu', () => {
  it('shows the placeholder, then the chosen label', () => {
    const { trigger } = setup();
    expect(trigger).toHaveTextContent('Select an event');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click and reports the clicked option', () => {
    const { onChange, trigger } = setup();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: /alpha/i })).toHaveTextContent('First');
    fireEvent.click(screen.getByRole('option', { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks the current value as selected', () => {
    const { trigger } = setup({ value: 'c' });
    expect(trigger).toHaveTextContent('Gamma');
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: /gamma/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /alpha/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('is fully usable from the keyboard', () => {
    const { onChange, trigger } = setup();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-activedescendant', 'pick-option-0');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(trigger).toHaveAttribute('aria-activedescendant', 'pick-option-2');
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('closes on Escape and on an outside click without choosing', () => {
    const { onChange, trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains an empty list instead of opening onto nothing', () => {
    const { trigger } = setup({ options: [], emptyMessage: 'Nothing open' });
    fireEvent.click(trigger);
    expect(screen.getByText('Nothing open')).toBeInTheDocument();
  });

  it('does not open when disabled', () => {
    const { trigger } = setup({ disabled: true });
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
