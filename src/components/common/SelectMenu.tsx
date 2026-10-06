/**
 * Styled single-select for short lists.
 *
 * The native <select> popup is drawn by the OS and cannot be styled, and it
 * shows one line of text per option. This is for pickers where the option
 * needs a second line or a status (an event with its dates), and where there
 * are few enough options that typing to filter would be a step backwards on
 * a phone: unlike SearchableSelect, opening it never raises the keyboard.
 *
 * Follows the ARIA select-only combobox pattern: focus stays on the trigger
 * and the active option is tracked with aria-activedescendant.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectMenuOption {
  value: string;
  label: string;
  /** Second line, e.g. dates and place. */
  description?: string;
  /** Short status shown at the right, e.g. "Live now". */
  tag?: string;
  /** Draws the tag in the brand colour rather than neutral. */
  tagEmphasis?: boolean;
}

interface SelectMenuProps {
  id: string;
  /** id of the visible label element. */
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export const SelectMenu: React.FC<SelectMenuProps> = ({
  id, labelledBy, value, onChange, options,
  placeholder = 'Select…', emptyMessage = 'Nothing to choose from', disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const optionId = (index: number) => `${id}-option-${index}`;

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [disabled, options, value]);

  const close = useCallback(() => { setIsOpen(false); setActive(-1); }, []);

  const choose = useCallback((option: SelectMenuOption | undefined) => {
    if (option) onChange(option.value);
    close();
  }, [onChange, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const node = listRef.current.children[active] as HTMLElement | undefined;
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((i) => Math.min(i + 1, last)); break;
      case 'ArrowUp': e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter':
      case ' ': e.preventDefault(); choose(options[active]); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(); break;
      default: break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        aria-labelledby={`${labelledBy} ${id}-value`}
        aria-activedescendant={isOpen && active >= 0 ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        className="input-field flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span id={`${id}-value`} className={`truncate ${selected ? '' : 'text-stone-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-150 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-labelledby={labelledBy}
          className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                // Keeps focus on the trigger so the click lands as a selection.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 ${
                  index === active ? 'bg-brand-50' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm text-stone-900 ${isSelected ? 'font-semibold' : ''}`}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block truncate text-xs text-stone-500">{option.description}</span>
                  )}
                </span>
                {option.tag && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      option.tagEmphasis ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {option.tag}
                  </span>
                )}
                <Check
                  className={`h-4 w-4 shrink-0 text-brand-600 ${isSelected ? '' : 'invisible'}`}
                  aria-hidden="true"
                />
              </li>
            );
          })}

          {options.length === 0 && (
            <li className="px-3 py-3 text-sm text-stone-500">{emptyMessage}</li>
          )}
        </ul>
      )}
    </div>
  );
};
