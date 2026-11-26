// POST /api/panel  { id, ids, filter? }  -> one PanelResult.
// One dispatcher, not one route file per source (PROJECT-PLAN.md §9.3).

import { NextResponse } from 'next/server';
import { byId } from '@/lib/registry';
import { filterById } from '@/lib/filters';
import { toState, provenanceOf } from '@/lib/http';
import type { ActiveFilter, Identifiers, PanelResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * A filter arrives from the browser, so it is checked against the catalogue
 * before it reaches a connector (§11.8). Three things must hold, and the
 * route refuses rather than guesses on any of them:
 *
 *   · the filter exists, and its mode is 'applied' — a 'pinned' or 'handoff'
 *     filter cannot be sent anywhere, by definition;
 *   · the option belongs to that filter, so the VALUE is one we wrote, never
 *     a string the client composed. ClinVar's values are E-utilities query
 *     syntax that we interpolate into a search term, so accepting a
 *     client-supplied value would let the caller rewrite the query;
 *   · the filter governs THIS connector, so a panel can never be labelled
 *     with a filter it did not apply.
 */
function validateFilter(
  raw: unknown,
  connectorId: string,
): { ok: true; filter?: ActiveFilter } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== 'object') return { ok: false, error: 'filter must be an object' };

  const { filterId, optionId } = raw as { filterId?: unknown; optionId?: unknown };
  if (typeof filterId !== 'string' || typeof optionId !== 'string') {
    return { ok: false, error: 'filter needs filterId and optionId' };
  }

  const def = filterById(filterId);
  if (!def) return { ok: false, error: `Unknown filter: ${filterId}` };
  if (def.mode !== 'applied') {
    return { ok: false, error: `Filter ${filterId} is '${def.mode}' and cannot be applied here` };
  }
  if (!def.connectors.includes(connectorId)) {
    // Not an error: this panel simply is not governed by that filter, and the
    // caller is expected to have scoped the panel set already. Run unfiltered.
    return { ok: true };
  }

  const option = def.options?.find((o) => o.id === optionId);
  if (!option) return { ok: false, error: `Unknown option ${optionId} for filter ${filterId}` };

  // The value comes from OUR catalogue, never from the request.
  return { ok: true, filter: { filterId, optionId, value: option.value } };
}

export async function POST(request: Request) {
  let body: { id?: string; ids?: Identifiers; filter?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const connector = body.id ? byId(body.id) : undefined;
  if (!connector) {
    return NextResponse.json({ error: `Unknown connector: ${body.id ?? '(none)'}` }, { status: 404 });
  }
  if (!body.ids) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  }

  const checked = validateFilter(body.filter, connector.id);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const base = {
    id: connector.id,
    source: connector.source,
    sourceUrl: connector.sourceUrl,
  };
  const started = Date.now();

  // §5.2 / §5.4: a connector needing a key we do not have is 'unconfigured',
  // which is a configuration fact, not a failure of the source.
  if (connector.envKey && !process.env[connector.envKey]) {
    const result: PanelResult = {
      ...base,
      state: 'unconfigured',
      message: `Set ${connector.envKey} in .env.local to enable this panel.`,
      fetchedAt: new Date().toISOString(),
      cached: false,
      ms: 0,
    };
    return NextResponse.json(result);
  }

  try {
    const out = await connector.run(body.ids, { markCached: () => {}, filter: checked.filter });
    const result: PanelResult = { ...base, ...out, ms: Date.now() - started };
    return NextResponse.json(result);
  } catch (e) {
    // §5.4: panels fail independently. A thrown connector never 500s the page;
    // it returns a panel carrying its own state.
    const { state, message } = toState(e);

    // An absence is a finding, so it carries the freshness of the response it
    // was read from — not of this request. Where the error brought provenance
    // with it (a cached 404, or a payload that came back empty), that is what
    // is reported; "now, uncached" only when genuinely nothing was fetched,
    // e.g. a connector declining on its own `requires`.
    const prov = provenanceOf(e);
    const result: PanelResult = {
      ...base,
      state,
      message,
      fetchedAt: new Date(prov?.fetchedAt ?? Date.now()).toISOString(),
      cached: prov?.cached ?? false,
      ms: Date.now() - started,
    };
    return NextResponse.json(result);
  }
}
