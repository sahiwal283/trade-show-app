/**
 * Theme picker — lets a reviewer flip between the candidate colour schemes
 * from the dashboard. The whole app recolours immediately.
 */

import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES, ThemeId, applyTheme, getStoredTheme } from './themes';

export function ThemePicker() {
  const [active, setActive] = useState<ThemeId>(getStoredTheme);

  const choose = (id: ThemeId) => {
    applyTheme(id);
    setActive(id);
  };

  return (
    <section className="card p-3 sm:p-4" aria-labelledby="theme-picker-title">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 id="theme-picker-title" className="card-title flex items-center gap-2">
          <Palette aria-hidden="true" className="h-4 w-4 self-center text-brand-600" />
          Colour theme
        </h2>
        <p className="text-sm text-stone-500">Pick one to preview it across the whole app.</p>
      </div>

      <div role="radiogroup" aria-labelledby="theme-picker-title" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {THEMES.map((theme) => {
          const selected = theme.id === active;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(theme.id)}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-left transition-colors duration-150 ${
                selected
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <span aria-hidden="true" className="flex h-9 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-black/10">
                {theme.swatches.map((color, i) => (
                  <span key={i} className="h-full flex-1" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight text-stone-900">{theme.name}</span>
                <span className="block text-xs text-stone-500">{theme.description}</span>
              </span>
              {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
