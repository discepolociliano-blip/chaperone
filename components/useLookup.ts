'use client';

// All of the interface's fetching and sequencing, in one place.
//
// §9.3 keeps fetch logic out of components, and M8 is where that rule earns
// its keep: the page has four asynchronous things in flight at once (the
// resolution, eighteen panels, the suggestion rules) and they must not be able
// to spoil each other. Keeping the orchestration here means every component
// below is a pure function of props, so a panel cannot accidentally become a
// place where a request happens.
//
// Three ordering facts shape this hook:
//
//   1. Panels are fetched in PARALLEL and rendered as they land. §7.11 wants a
//      first meaningful panel inside 2 s on a warm cache, and the slowest
//      source in the set has a 45 s budget (GWAS Catalog), so anything
//      sequential would miss by twenty-fold.
//   2. Panels fail INDEPENDENTLY. §7.8b is that killing the network mid-load
//      leaves the page usable, so every panel request has its own catch and a
//      failure becomes that panel's `unavailable` state — never a thrown
//      render, never a blanked page.
//   3. Suggestions come LAST, because the rules read the panels (§8). They are
//      requested once the panels have settled, and a failure there is silent
//      by design: no suggestions is a smaller loss than a broken page.
//
// Every lookup carries a generation number. Without it, a slow panel from a
// previous query can land after a new search and render one gene's data under
// another's name — the §6.5 failure arriving through the back door of async
// ordering rather than through a bad identifier.

import { useCallback, useRef, useState } from 'react';
import type { Identifiers, Layer, PanelResult, Preset } from '@/lib/types';
import type { Suggestion } from '@/lib/suggest';
import { connectorsForFilter } from '@/lib/filters';
import type { ActiveSelection } from '@/components/FilterBrowser';

export interface PanelSpec {
  id: string;
  name: string;
  source: string;
  layer: Layer;
  presets: Preset[];
}

export interface DeepLinkInfo {
  id: string;
  name: string;
  source: string;
  href: string;
  access: 'open' | 'credentialed' | 'application';
  lands: 'record' | 'prefilled-search' | 'index';
  verifiedBy: string;
  presets: Preset[];
  note: string;
}

export interface Resolved {
  ids: Identifiers;
  explanation: string;
  notes: string[];
  panels: PanelSpec[];
  deepLinks: DeepLinkInfo[];
}

export interface DroppedSuggestion {
  query?: string;
  rule: string;
  why?: string;
}

export interface LookupState {
  query: string;
  busy: boolean;
  error: string | null;
  resolved: Resolved | null;
  results: Record<string, PanelResult>;
  suggestions: Suggestion[];
  dropped: DroppedSuggestion[];
  /**
   * The rules read the panels, so they cannot run until the panels settle —
   * which means the slowest source in the set gates them. On SCN9A that was
   * measured at ~20 s, all of it spent with the suggestion block simply absent.
   *
   * An absent block and a block that found nothing look identical, and that is
   * the §5.4 mistake applied to suggestions: "no suggestions" is an answer, and
   * "not yet" must not be able to impersonate it. This flag is what lets the
   * block say which one is true.
   */
  suggesting: boolean;
  /**
   * The filter the researcher picked from the catalogue (§11.8), or null.
   *
   * It lives here rather than in the page because selecting one REFETCHES: an
   * 'applied' filter is a different question put to the source, so the panel it
   * governs has to be asked again. A filter held in the page could drift out of
   * step with the results on screen, which is the §6.5 failure wearing a filter
   * chip — a panel labelled with a narrowing it did not apply.
   */
  filter: ActiveSelection | null;
}

/**
 * Which panels a selection scopes the page to.
 *
 * A filter is a fact about particular sources: ClinVar's review status exists
 * at ClinVar. So selecting one answers the researcher's "just that" by cutting
 * the page down to the sources that carry the facet. Returning every spec for
 * `null` is what makes clearing the filter restore the full board.
 */
function scopeFor(specs: PanelSpec[], sel: ActiveSelection | null): PanelSpec[] {
  if (!sel) return specs;
  const governed = connectorsForFilter(sel.filterId);
  return specs.filter((s) => governed.includes(s.id));
}

export function useLookup() {
  const [state, setState] = useState<LookupState>({
    query: '',
    busy: false,
    error: null,
    resolved: null,
    results: {},
    suggestions: [],
    dropped: [],
    suggesting: false,
    filter: null,
  });

  /**
   * Identifies the current lookup, so stale responses can be discarded.
   *
   * Picking a filter bumps this too, and must: panels for the unfiltered
   * question are in flight when the click happens, and one landing afterwards
   * would render an unfiltered count under a filter's label.
   */
  const generation = useRef(0);

  /**
   * The resolution the panels belong to, readable from a callback without
   * making that callback depend on state. `applyFilter` needs the identifiers
   * and the panel list, and taking them from the closure would freeze them.
   */
  const resolvedRef = useRef<Resolved | null>(null);

  const setQuery = useCallback((query: string) => {
    setState((s) => ({ ...s, query }));
  }, []);

  /**
   * Fetch one panel, filtered if the selection governs it.
   *
   * The filter is sent as ids only — `{ filterId, optionId }`. The VALUE is
   * never sent: the route looks it up in the catalogue (§11.8), because
   * ClinVar's values are E-utilities query syntax interpolated into a search
   * term and a client-composed value would be a query-rewrite hole.
   *
   * A selection with no `optionId` is a scope, not a narrowing, so no filter
   * goes with the request at all — the panel runs its ordinary question and is
   * simply one of the few still on screen.
   */
  const fetchPanel = useCallback(
    async (spec: PanelSpec, ids: Identifiers, sel: ActiveSelection | null): Promise<PanelResult> => {
      try {
        const res = await fetch('/api/panel', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: spec.id,
            ids,
            filter: sel?.optionId ? { filterId: sel.filterId, optionId: sel.optionId } : undefined,
          }),
        });
        return (await res.json()) as PanelResult;
      } catch (e) {
        // A request that never arrived is 'unavailable' — the source could not
        // be reached. It is not 'empty', which would claim the source answered
        // and had nothing (§5.4).
        return {
          id: spec.id,
          source: spec.source,
          sourceUrl: '',
          state: 'unavailable',
          message: e instanceof Error ? e.message : 'Request failed',
          fetchedAt: new Date().toISOString(),
          cached: false,
          ms: 0,
        };
      }
    },
    [],
  );

  /**
   * Re-ask the sources under a filter. §11.8.
   *
   * Every scoped panel is cleared first, so the board shows them loading rather
   * than showing the previous answer under the new filter's label for as long
   * as the slowest source takes. Suggestions are left as they were: the rules
   * ran over the full board (§8) and re-running them against a two-panel
   * scope would narrow the one part of the page whose job is to widen.
   */
  const applyFilter = useCallback(
    async (sel: ActiveSelection | null) => {
      const data = resolvedRef.current;
      if (!data) return;

      const gen = ++generation.current;
      const fresh = () => generation.current === gen;

      const specs = scopeFor(data.panels, sel);
      setState((s) => ({ ...s, filter: sel, results: {} }));

      await Promise.all(
        specs.map(async (spec) => {
          const result = await fetchPanel(spec, data.ids, sel);
          if (fresh()) setState((s) => ({ ...s, results: { ...s.results, [spec.id]: result } }));
        }),
      );
    },
    [fetchPanel],
  );

  const lookup = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;

    const gen = ++generation.current;
    const fresh = () => generation.current === gen;

    // A new subject clears the filter. Carrying "pathogenic only" from the last
    // gene into this one would be a narrowing the researcher did not ask for
    // here, applied silently to a different question.
    resolvedRef.current = null;
    setState({
      query: q,
      busy: true,
      error: null,
      resolved: null,
      results: {},
      suggestions: [],
      dropped: [],
      suggesting: false,
      filter: null,
    });

    let data: Resolved;
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!fresh()) return;
      if (!res.ok) {
        setState((s) => ({ ...s, busy: false, error: body.error ?? `Resolve failed (${res.status})` }));
        return;
      }
      data = body as Resolved;
    } catch (e) {
      if (!fresh()) return;
      setState((s) => ({
        ...s,
        busy: false,
        error: e instanceof Error ? e.message : 'Could not reach the resolver',
      }));
      return;
    }

    // `suggesting` goes true here rather than at the /api/suggest call,
    // because the waiting starts now: the rules are gated on the panels.
    resolvedRef.current = data;
    setState((s) => ({ ...s, busy: false, resolved: data, suggesting: data.panels.length > 0 }));

    // Each panel is its own request with its own failure. One dead source
    // cannot delay, blank or throw the others (§5.4, §7.8b).
    const settled = await Promise.all(
      data.panels.map(async (spec): Promise<PanelResult> => {
        const result = await fetchPanel(spec, data.ids, null);
        if (fresh()) setState((s) => ({ ...s, results: { ...s.results, [spec.id]: result } }));
        return result;
      }),
    );

    if (!fresh()) return;

    // The rules read what the panels returned, so they run once those have
    // settled. Silent on failure: §8 suggestions are navigation, and losing
    // them costs less than surfacing an error for something nobody asked for.
    // `suggesting` is cleared on every path out, including the failures, so the
    // block can never be left claiming it is still working.
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: data.ids, panels: settled }),
      });
      if (!res.ok) {
        if (fresh()) setState((s) => ({ ...s, suggesting: false }));
        return;
      }
      const body = await res.json();
      if (!fresh()) return;
      setState((s) => ({
        ...s,
        suggestions: body.suggestions ?? [],
        dropped: body.dropped ?? [],
        suggesting: false,
      }));
    } catch {
      /* no suggestions; the page is unaffected */
      if (fresh()) setState((s) => ({ ...s, suggesting: false }));
    }
  }, [fetchPanel]);

  return { ...state, setQuery, lookup, applyFilter, scopeFor };
}
