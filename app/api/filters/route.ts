// GET /api/filters[?q=]  -> the filter vocabulary of every source, in funnel
// order. PROJECT-PLAN.md §11.8.
//
// Static data, so this could have been imported straight into the client. It
// is a route because §9.1 keeps one answer shape for "what can Chaperone do":
// the browser asks, the server answers, and the catalogue can later grow a
// source-derived part (live facet values, say) without the interface changing.
//
// `q` runs the same typeahead the search box uses, so the list the researcher
// sees while typing and the list this returns cannot diverge.

import { NextResponse } from 'next/server';
import { FILTERS, FILTER_LAYER_ORDER, searchFilters } from '@/lib/filters';
import { LAYER_LABEL } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  const matched = q ? searchFilters(q) : FILTERS;
  const ids = new Set(matched.map((f) => f.id));

  // Grouped by funnel layer and always in that order — never by match score.
  // A list that reorders itself as you type costs more in re-orientation than
  // it saves, which is the same reasoning as §11.2.
  const groups = FILTER_LAYER_ORDER.map((layer) => ({
    layer,
    label: LAYER_LABEL[layer],
    filters: FILTERS.filter((f) => f.layer === layer && ids.has(f.id)),
  })).filter((g) => g.filters.length > 0);

  return NextResponse.json({
    query: q,
    total: FILTERS.length,
    matched: matched.length,
    groups,
    // The counts the interface states, computed here so it cannot miscount.
    modes: {
      applied: FILTERS.filter((f) => f.mode === 'applied').length,
      pinned: FILTERS.filter((f) => f.mode === 'pinned').length,
      handoff: FILTERS.filter((f) => f.mode === 'handoff').length,
    },
  });
}
