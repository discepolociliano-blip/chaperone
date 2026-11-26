'use client';

// The dashboard. PROJECT-PLAN.md M8, extended by §11.8.
//
// This file replaces the provisional debug view M1 left behind (§14.2), which
// had grown into three of M8's six jobs and could not render the organism
// identity M5 added. It is deliberately thin: composition and a little view
// state. The fetching lives in `useLookup` (§9.3 keeps components free of it)
// and everything below is a function of its props.
//
// What each part answers:
//   SearchBox         §7.1 — one box, any identifier
//   tab row           §11.8 — results, the filter vocabulary, or a structure
//   FilterBrowser     §11.8 — what you can narrow by, in funnel order
//   StructureDrop     §11.9 — start from a file, parsed in the browser
//   PresetBar         §11.2 / §7.16 — filters, never reorders
//   ResolvedIdentity  §7.1, §5.5 — what it resolved to, and what was ambiguous
//   PanelGrid         §11.3, §5.4 — everything at once, four states
//   Suggestions       §8 / §7.17 — a real next query, with its rule named
//   DeepLinkStrip     §6.4 / §3.1 — credentials happen at the source
//   Attributions      §5.6 — the HPO and GTEx licence obligations
//
// TWO NARROWINGS NOW MEET HERE, and they are not the same kind of thing:
//
//   · a PRESET is about domains — "I am working on antivirals" — and hides
//     panels whose sources have nothing to say in that domain;
//   · a FILTER is about facets — "pathogenic only" — and cuts the page to the
//     sources that carry the facet, re-asking the ones that can apply it.
//
// They compose, and the page owes the researcher a count either way. A panel
// that was never asked is not a panel that found nothing (§5.4), and once two
// controls can remove panels, saying which one removed them is the whole
// difference between a narrowed board and a broken one.
//
// The preset and the filter both live in memory rather than the URL. §11.4
// settled that this is built for you and does not need to teach a stranger; a
// shareable filtered view is a v2 concern.

import { useMemo, useState } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { PresetBar } from '@/components/PresetBar';
import { ResolvedIdentity } from '@/components/ResolvedIdentity';
import { PanelGrid } from '@/components/PanelGrid';
import { Suggestions } from '@/components/Suggestions';
import { DeepLinkStrip } from '@/components/DeepLinkStrip';
import { Attributions } from '@/components/Attributions';
import { FilterBrowser } from '@/components/FilterBrowser';
import { StructureDrop } from '@/components/StructureDrop';
import { useLookup } from '@/components/useLookup';
import { FILTERS, filterById, searchFilters } from '@/lib/filters';
import type { Preset } from '@/lib/types';
import type { ActiveSelection } from '@/components/FilterBrowser';

type Tab = 'results' | 'filters' | 'structure';

export default function Home() {
  const {
    query,
    busy,
    error,
    resolved,
    results,
    suggestions,
    dropped,
    suggesting,
    filter,
    setQuery,
    lookup,
    applyFilter,
    scopeFor,
  } = useLookup();
  const [preset, setPreset] = useState<Preset | null>(null);
  const [tab, setTab] = useState<Tab>('results');

  const search = (q: string) => {
    setQuery(q);
    setTab('results');
    void lookup(q);
  };

  // Selecting a filter is a question, not a view toggle, so it goes to the
  // hook and the sources are asked again. The tab closes on the way out: you
  // picked a narrowing in order to look at the results of it.
  const select = (sel: ActiveSelection | null) => {
    setTab('results');
    void applyFilter(sel);
  };

  const activeDef = filter ? filterById(filter.filterId) : undefined;
  const activeOption = activeDef?.options?.find((o) => o.id === filter?.optionId);

  // Two narrowings, applied in the order they are explained above. §11.2 holds
  // for both: each removes panels and neither reorders them.
  const specs = resolved?.panels ?? [];
  const scoped = useMemo(() => scopeFor(specs, filter), [specs, filter, scopeFor]);
  const visible = useMemo(() => {
    if (!preset) return scoped;
    return scoped.filter((s) => s.presets.length === 0 || s.presets.includes(preset));
  }, [scoped, preset]);

  const hiddenByFilter = specs.length - scoped.length;
  const hiddenByPreset = scoped.length - visible.length;

  // How many rows the catalogue would show for what is in the box right now.
  // On the tab itself, because the point of the tab is that you can see there
  // is something to narrow by before you open it.
  const matching = useMemo(() => (query.trim() ? searchFilters(query).length : 0), [query]);

  return (
    <main className="wrap">
      <header className="masthead">
        <h1>Chaperone</h1>
      </header>

      <SearchBox query={query} busy={busy} onQueryChange={setQuery} onSubmit={search} />

      <div className="tabs" role="tablist" aria-label="Results or filters">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'results'}
          className={`tab${tab === 'results' ? ' on' : ''}`}
          onClick={() => setTab('results')}
        >
          Results
          {resolved ? <span className="tab-count">{visible.length}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'filters'}
          className={`tab${tab === 'filters' ? ' on' : ''}`}
          onClick={() => setTab(tab === 'filters' ? 'results' : 'filters')}
        >
          Filters
          <span className="tab-count">
            {matching > 0 && matching < FILTERS.length ? `${matching}/${FILTERS.length}` : FILTERS.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'structure'}
          className={`tab${tab === 'structure' ? ' on' : ''}`}
          onClick={() => setTab(tab === 'structure' ? 'results' : 'structure')}
        >
          Structure
        </button>
        {activeDef && (
          <span className="tab-active">
            {activeDef.label}
            {activeOption ? `: ${activeOption.label}` : ' · sources only'}
            <button type="button" className="tab-clear" onClick={() => select(null)} aria-label="Clear filter">
              ✕
            </button>
          </span>
        )}
      </div>

      <FilterBrowser
        query={query}
        open={tab === 'filters'}
        active={filter}
        onSelect={select}
        onClose={() => setTab('results')}
      />

      {/* §11.9. `search` is the ordinary lookup: an accession read out of a
          file is treated exactly as one typed into the box, because that is
          all that leaves the browser. */}
      <StructureDrop open={tab === 'structure'} onSubmit={search} onClose={() => setTab('results')} />

      {error && <div className="error-box">{error}</div>}

      {tab === 'results' && resolved && (
        <>
          <ResolvedIdentity
            ids={resolved.ids}
            explanation={resolved.explanation}
            notes={resolved.notes}
            noPanels={resolved.panels.length === 0}
          />

          {activeDef && (
            <div className="filter-note">
              <strong>
                {activeDef.label}
                {activeOption ? ` — ${activeOption.label}` : ''}
              </strong>{' '}
              {activeOption ? (
                activeDef.evidence
              ) : (
                <>
                  {scoped.length === 1
                    ? 'Scoped to the one source that carries this facet. Nothing inside it is narrowed — the narrowing itself happens at the source.'
                    : `Scoped to the ${scoped.length} sources that carry this facet. Nothing inside them is narrowed — the narrowing itself happens at the source.`}{' '}
                  {activeDef.evidence}
                </>
              )}
              {hiddenByFilter > 0 && (
                <>
                  {' '}
                  <strong>
                    {hiddenByFilter} panel{hiddenByFilter === 1 ? '' : 's'} hidden
                  </strong>{' '}
                  — hidden, not empty: those sources do not have this facet, so they were not asked, and
                  nothing here says they have no record.
                </>
              )}
            </div>
          )}

          {resolved.panels.length > 0 && (
            <PresetBar active={preset} onChange={setPreset} hidden={hiddenByPreset} />
          )}

          <PanelGrid specs={visible} results={results} expectedSymbol={resolved.ids.symbol} />

          <Suggestions
            suggestions={suggestions}
            dropped={dropped}
            deepLinks={resolved.deepLinks}
            suggesting={suggesting}
            onQuery={search}
            onPreset={setPreset}
          />

          <DeepLinkStrip links={resolved.deepLinks} preset={preset} />
        </>
      )}

      <Attributions results={results} />
    </main>
  );
}
