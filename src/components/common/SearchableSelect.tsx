/**
 * Type-to-filter dropdown for the expense entry picklists.
 *
 * Sourcing categories from Midas made the list long enough that scrolling a
 * native <select> is the slow path, and cards are easiest to find by the last
 * four digits printed on the receipt rather than by their label. `searchText`
 * carries those extra digits so a card matches on either.
 *
 * Hand-rolled rather than pulled from a combobox library: this app's runtime
 * dependencies are react, lucide, and dexie, and one field does not justify a
 * fourth.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Extra text to match against, e.g. a card's last four digits. */
  searchText?: string;
}

interface SearchableSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Shown in place of the empty-result message while options are loading. */
  emptyMessage?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  required = false,
  className = '',
  emptyMessage = 'No matches',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.searchText ? o.searchText.toLowerCase().includes(q) : false)
    );
  }, [options, query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setHighlighted(-1);
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setQuery('');
    setHighlighted(-1);
  }, [disabled]);

  const select = useCallback(
    (option: SearchableSelectOption) => {
      onChange(option.value);
      close();
    },
    [onChange, close]
  );

  // Close on an outside click. A mousedown listener rather than onBlur so that
  // clicking an option commits the selection before focus moves away.
  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen, close]);

  // Keep the highlighted row in view when moving through a long list.
  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return;
    const node = listRef.current.children[highlighted] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) return open();
        setHighlighted((i) => (filtered.length === 0 ? -1 : Math.min(i + 1, filtered.length - 1)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) return;
        setHighlighted((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        // Never let a dropdown selection submit the surrounding expense form.
        if (isOpen) {
          e.preventDefault();
          if (highlighted >= 0 && filtered[highlighted]) select(filtered[highlighted]);
        }
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        if (isOpen) close();
        break;
      default:
        break;
    }
  };

  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? optionId(highlighted) : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        placeholder={placeholder}
        value={isOpen ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setHighlighted(-1);
        }}
        onFocus={open}
        onClick={open}
        onKeyDown={handleKeyDown}
        className="input-field w-full pr-9"
      />

      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
        aria-hidden="true"
      />

      {isOpen && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              // Keeps focus on the input so the click lands as a selection.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(option)}
              onMouseEnter={() => setHighlighted(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                index === highlighted ? 'bg-brand-50 text-brand-900' : 'text-stone-700'
              } ${option.value === value ? 'font-medium' : ''}`}
            >
              {option.label}
            </li>
          ))}

          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-stone-500">{emptyMessage}</li>
          )}
        </ul>
      )}
    </div>
  );
};
