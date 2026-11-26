'use client';

// Domain filters. PROJECT-PLAN.md §11.2 and criterion 16.
//
// A preset NARROWS the panel set. It never reorders it. That was your
// decision, and the reasoning is worth keeping next to the control: a
// researcher who learns where the gnomAD panel sits should find it in the same
// place every time, and a layout that rearranges itself between queries costs
// more in re-orientation than it saves in scrolling.
//
// (§7.16 used to read "each preset reorders panels", which contradicted this.
// Corrected 2026-11-06 — a criterion that disagrees with the decision it
// checks would have failed a correct build.)
//
// The filter is also deliberately honest about what it hides. A panel removed
// by a filter is not a panel that found nothing, and a count of what is hidden
// is the difference between the two.

import { PRESETS } from '@/lib/presets';
import type { Preset } from '@/lib/types';

export interface PresetBarProps {
  active: Preset | null;
  onChange: (p: Preset | null) => void;
  /** How many panels the active filter is currently hiding. */
  hidden: number;
}

export function PresetBar({ active, onChange, hidden }: PresetBarProps) {
  const activeDef = PRESETS.find((p) => p.id === active);

  return (
    <div className="presets">
      <div className="preset-row">
        <span className="preset-label">Filter</span>
        <button
          type="button"
          className={`chip ${active === null ? 'on' : ''}`}
          onClick={() => onChange(null)}
          aria-pressed={active === null}
        >
          Everything
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip ${active === p.id ? 'on' : ''}`}
            onClick={() => onChange(active === p.id ? null : p.id)}
            aria-pressed={active === p.id}
            title={p.blurb}
          >
            {p.label}
          </button>
        ))}
      </div>

      {activeDef && (
        <div className="preset-note">
          {activeDef.blurb}
          {hidden > 0 && (
            <>
              {' '}
              <strong>
                {hidden} panel{hidden === 1 ? '' : 's'} hidden by this filter
              </strong>{' '}
              — hidden, not empty: they were not asked, so nothing here says those sources have no record.
              Panels keep their positions; a filter removes, it never rearranges.
            </>
          )}
        </div>
      )}
    </div>
  );
}
