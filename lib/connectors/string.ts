// STRING functional association network.
//
// Two calls, deliberately. `get_string_ids` maps the symbol to STRING's own
// canonical protein id and returns its preferred name, which we use as
// symbolSeen — so a mis-resolution shows up instead of hiding.
//
// The important subtlety: /network returns the subnetwork among a protein's
// nearest neighbours, which includes edges BETWEEN neighbours. Measured on
// SCN9A: 15 edges returned, only 4 involving SCN9A itself. Reporting the raw
// edge count as "interactions" would overstate the gene's partners four-fold,
// so we count direct partners and label the rest for what they are.
//
// §5.3: STRING requires callers to identify themselves via caller_identity.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const BASE = 'https://string-db.org/api/json';
const CALLER = 'chaperone';
/** How many neighbours to ask STRING for. See the note in run(). */
const NEIGHBOUR_LIMIT = 20;

interface StringIdHit {
  stringId?: string;
  preferredName?: string;
  annotation?: string;
}

interface StringEdge {
  preferredName_A?: string;
  preferredName_B?: string;
  score?: number;
}

export const string: Connector = {
  id: 'string',
  name: 'Functional associations',
  source: 'STRING',
  sourceUrl: 'https://string-db.org/',
  layer: 'target',
  requires: [['symbol']],
  presets: [],
  timeoutMs: 10000,

  async run(ids, ctx) {
    const meta = new FetchMeta();
    if (!ids.symbol) throw new NoEntry('No gene symbol', meta.provenance());

    // §11.8: STRING's own confidence floor. Probed to change the answer —
    // SCN9A gives 575 edges unfiltered and 94 at >=900 — so this narrows at
    // the source rather than hiding rows we already fetched.
    const scoreFloor = ctx.filter?.filterId === 'string-score' ? ctx.filter.value : undefined;
    const scoreParam = scoreFloor ? `&required_score=${encodeURIComponent(scoreFloor)}` : '';

    const { json: mapped } = meta.record(await fetchJson<StringIdHit[]>(
      `${BASE}/get_string_ids?identifiers=${encodeURIComponent(ids.symbol)}&species=9606&limit=1&caller_identity=${CALLER}`,
      { timeoutMs: this.timeoutMs, ttlMs: TTL.long, emptyOn: [404] },
    ));

    const hit = Array.isArray(mapped) ? mapped[0] : undefined;
    if (!hit?.stringId) throw new NoEntry(`STRING does not know a human protein called ${ids.symbol}`, meta.provenance());

    const canonical = hit.preferredName ?? ids.symbol;

    const { json: edges } = meta.record(await fetchJson<StringEdge[]>(
      `${BASE}/network?identifiers=${encodeURIComponent(hit.stringId)}&species=9606&limit=${NEIGHBOUR_LIMIT}${scoreParam}&caller_identity=${CALLER}`,
      { timeoutMs: this.timeoutMs, ttlMs: TTL.long, emptyOn: [404] },
    ));

    const all = Array.isArray(edges) ? edges : [];
    const direct = all.filter(
      (e) =>
        e.preferredName_A?.toUpperCase() === canonical.toUpperCase() ||
        e.preferredName_B?.toUpperCase() === canonical.toUpperCase(),
    );

    if (!direct.length) throw new NoEntry(`STRING returned no associations for ${canonical}`, meta.provenance());

    const partners = direct
      .map((e) => {
        const other = e.preferredName_A?.toUpperCase() === canonical.toUpperCase() ? e.preferredName_B : e.preferredName_A;
        return { name: other, score: e.score ?? 0 };
      })
      .filter((p): p is { name: string; score: number } => Boolean(p.name))
      .sort((a, b) => b.score - a.score);

    // Deliberately NOT reported as a count. STRING's `limit` is "add this many
    // interactors", so the number of direct partners comes back equal to what
    // we asked for — printing it as "Direct partners: 20" would dress our own
    // request up as a finding about the gene (§5.5).
    const facts: Fact[] = [
      {
        label: `Top ${Math.min(NEIGHBOUR_LIMIT, partners.length)} associations by confidence`,
        value: partners
          .slice(0, 8)
          .map((p) => `${p.name} (${p.score.toFixed(2)})`)
          .join(' · '),
        note: `Confidence 0–1, combining experimental, database, co-expression and text-mining evidence. A high score is not proof of a physical interaction. This is the ${NEIGHBOUR_LIMIT} highest-confidence neighbours we requested, not STRING's full partner list.`,
      },
    ];

    if (all.length > direct.length) {
      facts.push({
        label: 'Neighbourhood edges',
        value: String(all.length),
        note: `Of these, ${all.length - direct.length} connect neighbours to each other and do not involve ${canonical}.`,
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://string-db.org/network/${encodeURIComponent(hit.stringId)}`,
      ...meta.get(),
      symbolSeen: canonical,
    };
  },
};
