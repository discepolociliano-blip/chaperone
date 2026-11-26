'use client';

// The filter vocabulary of every linked database, as a browsable surface under
// the search box. PROJECT-PLAN.md §11.8.
//
// This answers a question the dashboard could not: "what can I even narrow by
// here?" Normally you cannot know until you are on the site, which is most of
// why the fifteen-to-twenty-five-tab morning exists. The whole vocabulary is
// listed at once, grouped in funnel order (§11.2a), and typing in the search
// box narrows it — so the box doubles as a way to search the FILTERS, not only
// the subjects.
//
// THREE THINGS IT MUST NEVER DO, each a way of lying about a narrowing:
//
//  1. Offer a filter we cannot apply as though we could. Every row states its
//     mode. 'applied' re-queries the source and is the only mode that produces
//     option chips; 'pinned' is a restriction already in force that you are
//     entitled to see; 'handoff' is a facet that exists at the source but that
//     their API will not take from us — GWAS significance is a handoff because
//     that API accepts the parameter and silently discards it (lib/filters.ts).
//     For those two modes the only offer is "show only these sources", which
//     scopes the page without claiming to narrow within it.
//  2. Reorder as you type. The list is always §11.2a order; typing removes
//     rows, it never moves them. Same reasoning as §11.2.
//  3. Let a scoped-away panel look empty. That disclosure is the page's job
//     (page.tsx), and this component's contract with it is that selecting
//     anything here reports the filter id, so the page can say what it hid.

import { useEffect, useMemo, useState } from 'react';
import { FILTERS, FILTER_LAYER_ORDER, searchFilters, connectorsForFilter } from '@/lib/filters';
import type { FilterDef, FilterMode } from '@/lib/filters';
import { LAYER_LABEL } from '@/lib/registry';

export interface ActiveSelection {
  filterId: string;
  /**
   * Present only for an 'applied' filter, where an option was chosen and the
   * panels are re-queried with it. Absent means "scope the page to the sources
   * that carry this facet" — no narrowing is claimed inside them.
   */
  optionId?: string;
}

export interface FilterBrowserProps {
  /** The search box's text. Typing narrows the catalogue as it is typed. */
  query: string;
  open: boolean;
  active: ActiveSelection | null;
  onSelect: (sel: ActiveSelection | null) => void;
  onClose: () => void;
}

const MODE_NOTE: Record<FilterMode, string> = {
  applied: 'Applied here — picking an option re-queries the source.',
  pinned: 'Already in force — this is a restriction Chaperone imposes, not one you can change here.',
  handoff: 'Lives at the source — their API will not take it from us, so the link carries you there.',
};

export function FilterBrowser({ query, open, active, onSelect, onClose }: FilterBrowserProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Escape closes, because this sits over the results while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const matched = useMemo(() => searchFilters(query), [query]);

  // A subject is not a facet. "SCN9A" matches no filter name, and answering
  // that with an empty list would be useless and faintly accusing; the whole
  // catalogue is shown instead, with the reason stated. The distinction still
  // has to be visible, so `narrowed` drives the heading either way.
  const narrowed = query.trim().length > 0 && matched.length > 0;
  const shown = narrowed ? matched : FILTERS;
  const shownIds = useMemo(() => new Set(shown.map((f) => f.id)), [shown]);

  // Every layer of the funnel is listed, including one that has no filters at
  // all. Dropping it would be the §5.4 mistake moved up a level: a researcher
  // reading the spine would find a stage silently missing and could only guess
  // whether we forgot it or nothing can be narrowed there. While the list is
  // narrowed by typing, empty layers are dropped — there the absence means
  // "your word did not match", which the heading already says.
  const groups = useMemo(
    () =>
      FILTER_LAYER_ORDER.map((layer) => ({
        layer,
        label: LAYER_LABEL[layer],
        filters: FILTERS.filter((f) => f.layer === layer && shownIds.has(f.id)),
      })),
    [shownIds],
  );

  if (!open) return null;

  const noMatch = query.trim().length > 0 && matched.length === 0;

  const row = (f: FilterDef) => {
    const isOpen = expanded === f.id;
    const activeHere = active?.filterId === f.id;
    const sources = connectorsForFilter(f.id);

    return (
      <div key={f.id} className={`filt${activeHere ? ' on' : ''}`}>
        <button
          type="button"
          className="filt-head"
          onClick={() => setExpanded(isOpen ? null : f.id)}
          aria-expanded={isOpen}
        >
          <span className="filt-caret" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
          <span className="filt-label">{f.label}</span>
          <span className={`filt-mode ${f.mode}`}>{f.mode}</span>
          <span className="filt-src">
            {sources.length > 0 ? sources.join(' · ') : 'deep link only'} · their word: &ldquo;
            {f.sourceTerm}&rdquo;
          </span>
        </button>

        {isOpen && (
          <div className="filt-body">
            <p className="because">{f.because}</p>
            <p className="filt-evidence">
              <strong>{MODE_NOTE[f.mode]}</strong> {f.evidence}
            </p>

            {f.mode === 'pinned' && f.pinned && (
              <p className="filt-pinned">
                In force now: <code>{f.pinned}</code>
              </p>
            )}

            {f.mode === 'applied' && f.options && (
              <div className="filt-options">
                {f.options.map((o) => {
                  const chosen = active?.filterId === f.id && active.optionId === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`chip${chosen ? ' on' : ''}`}
                      onClick={() => onSelect(chosen ? null : { filterId: f.id, optionId: o.id })}
                    >
                      {o.label}
                      {o.hint && <span className="dim"> · {o.hint}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {sources.length > 0 && (
              <div className="filt-options">
                <button
                  type="button"
                  className={`chip${activeHere && !active?.optionId ? ' on' : ''}`}
                  onClick={() =>
                    onSelect(activeHere && !active?.optionId ? null : { filterId: f.id })
                  }
                >
                  {activeHere && !active?.optionId
                    ? sources.length === 1
                      ? 'Showing only this source'
                      : 'Showing only these sources'
                    : sources.length === 1
                      ? `Show only ${sources[0]}`
                      : `Show only these ${sources.length} sources`}
                </button>
                {f.mode !== 'applied' && (
                  <span className="dim filt-scope-note">
                    Scopes the page. The narrowing itself still happens at the source.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="filterbrowser" aria-label="Filters available across the linked databases">
      <div className="fb-head">
        <div className="layer-title">
          {narrowed
            ? `Filters matching “${query.trim()}” — ${matched.length} of ${FILTERS.length}`
            : `What every source lets you filter by — all ${FILTERS.length}`}
        </div>
        <div className="fb-head-actions">
          {active && (
            <button type="button" className="chip" onClick={() => onSelect(null)}>
              Clear filter
            </button>
          )}
          <button type="button" className="chip" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {noMatch && (
        <p className="fb-intro dim">
          &ldquo;{query.trim()}&rdquo; matches no facet name — it reads as a subject, not a filter. The
          whole catalogue is below. These fifteen are the facets Chaperone models; the sources have others
          it does not.
        </p>
      )}

      {groups.map((g) => {
        if (g.filters.length === 0) {
          if (narrowed) return null;
          return (
            <div key={g.layer} className="fb-group">
              <div className="fb-group-title">{g.label}</div>
              <p className="fb-empty-layer">
                No filter here yet. The sources at this stage have facets of their own; none has been
                probed and verified, and an unverified filter is worse than none — it would promise a
                narrowing nobody has shown the API performs.
              </p>
            </div>
          );
        }
        return (
          <div key={g.layer} className="fb-group">
            <div className="fb-group-title">{g.label}</div>
            {g.filters.map(row)}
          </div>
        );
      })}
    </section>
  );
}
