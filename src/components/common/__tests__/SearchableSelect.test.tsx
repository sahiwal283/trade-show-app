/**
 * SearchableSelect — the combobox that replaced the native <select> on the
 * category and card fields.
 *
 * The category list from Midas is long enough that scrolling a native select
 * is the slow path, and cards are easiest to find by the last four digits
 * printed on the receipt. Both are behaviours a native select cannot provide,
 * so they are the behaviours worth testing here.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from '../SearchableSelect';

const CATEGORIES = [
  { value: 'Booth / Marketing / Tools', label: 'Booth / Marketing / Tools' },
  { value: 'Meal and Entertainment', label: 'Meal and Entertainment' },
  { value: 'Parking Fees', label: 'Parking Fees' },
  { value: 'Travel - Flight', label: 'Travel - Flight' },
];

function renderSelect(props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  const onChange = vi.fn();
  render(
    <SearchableSelect
      id="category"
      value=""
      onChange={onChange}
      options={CATEGORIES}
      placeholder="Select category"
      {...props}
    />
  );
  return { onChange };
}

describe('SearchableSelect', () => {
  it('shows the placeholder when nothing is selected', () => {
    renderSelect();
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument();
  });

  it('displays the label of the current value', () => {
    renderSelect({ value: 'Parking Fees' });
    expect(screen.getByRole('combobox')).toHaveValue('Parking Fees');
  });

  it('lists every option when opened without typing', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('filters options by what the user types', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('park');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Parking Fees');
  });

  it('matches anywhere in the label, not just the start', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('marketing');

    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Booth / Marketing / Tools');
  });

  it('emits the option value when one is clicked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Meal and Entertainment'));

    expect(onChange).toHaveBeenCalledWith('Meal and Entertainment');
  });

  it('selects the highlighted option with the keyboard', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Meal and Entertainment');
  });

  it('restores the selected label and closes on Escape', async () => {
    const user = userEvent.setup();
    renderSelect({ value: 'Parking Fees' });

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('xyz{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Parking Fees');
  });

  it('reports when a search matches nothing', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('zzzz');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it('matches a card by its last four digits', async () => {
    // Typing the digits off the receipt is the fastest way to pick a card,
    // and those digits sit in the searchable text, not the label.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableSelect
        id="card"
        value=""
        onChange={onChange}
        options={[
          { value: 'Haute Amex (...1002)', label: 'Haute Amex (...1002)', searchText: '1002' },
          { value: 'Haute PNC (...3490)', label: 'Haute PNC (...3490)', searchText: '3490' },
        ]}
        placeholder="Select card"
      />
    );

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('3490');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Haute PNC');
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    renderSelect({ disabled: true });

    await user.click(screen.getByRole('combobox'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
