// Experimental structures from RCSB PDB, keyed on the UniProt accession.
// Searching by accession rather than symbol avoids the species and synonym
// ambiguity that symbol search carries.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const SEARCH = 'https://search.rcsb.org/rcsbsearch/v2/query';

interface SearchResponse {
  total_count?: number;
  result_set?: { identifier?: string; score?: number }[];
}

export const pdb: Connector = {
  id: 'pdb',
  name: 'Experimental structures',
  source: 'RCSB PDB',
  sourceUrl: 'https://www.rcsb.org/',
  layer: 'mechanism',
  requires: [['uniprot']],
  presets: [],
  timeoutMs: 10000,

  async run(ids, ctx) {
    const meta = new FetchMeta();
    if (!ids.uniprot) throw new NoEntry('No UniProt accession', meta.provenance());

    // §11.8: method decides what a structure can tell you — a cryo-EM map of a
    // full-length channel and a crystal of one isolated domain answer different
    // questions. Probed: Q15858 gives 44 entries unfiltered, 41 for cryo-EM.
    const method = ctx.filter?.filterId === 'pdb-method' ? ctx.filter.value : undefined;

    const accessionNode = {
      type: 'terminal',
      service: 'text',
      parameters: {
        attribute:
          'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession',
        operator: 'exact_match',
        value: ids.uniprot,
      },
    };

    const { json } = meta.record(await fetchJson<SearchResponse>(SEARCH, {
      timeoutMs: this.timeoutMs,
      ttlMs: TTL.long,
      method: 'POST',
      body: {
        query: method
          ? {
              type: 'group',
              logical_operator: 'and',
              nodes: [
                accessionNode,
                {
                  type: 'terminal',
                  service: 'text',
                  parameters: { attribute: 'exptl.method', operator: 'exact_match', value: method },
                },
              ],
            }
          : accessionNode,
        return_type: 'entry',
        request_options: { paginate: { start: 0, rows: 10 }, sort: [{ sort_by: 'score', direction: 'desc' }] },
      },
      // The method MUST be in the key. Without it a filtered and an unfiltered
      // search collide, and whichever ran first is served to the other — the
      // researcher would see 44 entries labelled "cryo-EM only", or 41 after
      // clearing the filter.
      cacheKey: `pdb-search ${ids.uniprot}${method ? ` method=${method}` : ''}`,
      // RCSB answers a search with no hits as 204, not an error.
      emptyOn: [204, 404],
    }));

    const total = json.total_count ?? 0;
    if (!total) throw new NoEntry(`No PDB entry references ${ids.uniprot}`, meta.provenance());

    const entries = (json.result_set ?? []).map((r) => r.identifier).filter((x): x is string => Boolean(x));

    const facts: Fact[] = [
      { label: 'Structures', value: total.toLocaleString() },
    ];

    if (entries.length) {
      facts.push({
        label: 'Entries',
        value: entries.slice(0, 8).join(', '),
        note: total > entries.length ? `Showing ${Math.min(8, entries.length)} of ${total}` : undefined,
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.rcsb.org/search?request=%7B%22query%22%3A%7B%22type%22%3A%22terminal%22%2C%22service%22%3A%22text%22%2C%22parameters%22%3A%7B%22attribute%22%3A%22rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession%22%2C%22operator%22%3A%22exact_match%22%2C%22value%22%3A%22${ids.uniprot}%22%7D%7D%2C%22return_type%22%3A%22entry%22%7D`,
      ...meta.get(),
    };
  },
};
