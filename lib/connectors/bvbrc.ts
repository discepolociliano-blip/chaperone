// BV-BRC genome holdings for an organism, with the host breakdown.
//
// §11.6: organism identification and context. The host-annotation count is the
// one datum here that speaks directly to host-directed work — "how many of
// these genomes were sampled from a human host" is a question about the
// host-pathogen relationship rather than about viral chemistry.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THREE COUNT QUERIES INSTEAD OF READING ROWS.
//
// Measured 2026-11-06. Two tempting shortcuts are both wrong:
//
//   - Faceting on host_name returns HTTP 400 (Solr error), with or without
//     mincount. There is no facet to read.
//   - Sampling the rows is worthless: the first 200 influenza A genomes ALL
//     have an empty host_name, while SARS-CoV-2's first rows read "Homo
//     sapiens". Row order is whatever Solr returns, so a tally over the first
//     N is a tally of nothing. Printing "hosts: Homo sapiens" off two rows out
//     of 9.4 million would be a fabricated finding of exactly the kind this
//     project exists to prevent.
//
// So each number is asked for as its own server-side `numFound` over the whole
// collection. `http_accept=application/solr+json` is what puts numFound in the
// body — the default JSON encoding reports the total only in a Content-Range
// HEADER, which fetchJson does not expose.
// ─────────────────────────────────────────────────────────────────────────

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const API = 'https://www.bv-brc.org/api/genome/';

interface SolrResponse {
  response?: { numFound?: number; docs?: Record<string, unknown>[] };
}

/** One server-side count over the full collection. */
async function numFound(query: string, timeoutMs: number, meta: FetchMeta): Promise<number> {
  const result = await fetchJson<SolrResponse>(
    `${API}?${query}&limit(1)&http_accept=application/solr+json`,
    { timeoutMs, ttlMs: TTL.long, cacheKey: `bvbrc ${query}` },
  );
  meta.record(result);
  const n = result.json.response?.numFound;
  if (typeof n !== 'number') throw new NoEntry('BV-BRC returned no count');
  return n;
}

export const bvbrc: Connector = {
  id: 'bvbrc',
  name: 'Genome holdings & host',
  source: 'BV-BRC',
  sourceUrl: 'https://www.bv-brc.org/',
  layer: 'pathogen',
  requires: [['taxid']],
  presets: ['antiviral'],
  // Measured at 4.1s in gate 1 and the slowest source there; three counts.
  timeoutMs: 30000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.taxid) throw new NoEntry('No NCBI taxid');
    const taxid = ids.taxid;
    const name = ids.organismName ?? `taxid ${taxid}`;

    const total = await numFound(`eq(taxon_id,${encodeURIComponent(taxid)})`, this.timeoutMs, meta);
    if (!total) throw new NoEntry(`BV-BRC holds no genome for ${name}`);

    const [human, complete] = await Promise.all([
      numFound(
        `and(eq(taxon_id,${encodeURIComponent(taxid)}),eq(host_name,%22Homo%20sapiens%22))`,
        this.timeoutMs,
        meta,
      ),
      numFound(
        `and(eq(taxon_id,${encodeURIComponent(taxid)}),eq(genome_status,Complete))`,
        this.timeoutMs,
        meta,
      ),
    ]);

    const pct = (n: number) => {
      const p = (n / total) * 100;
      return p > 0 && p < 0.1 ? '<0.1' : p.toFixed(1);
    };

    const facts: Fact[] = [
      {
        label: 'Genomes',
        value: total.toLocaleString(),
        note:
          'As with sequence counts, this tracks collection and sequencing effort rather ' +
          'than the organism\'s importance.',
      },
      {
        label: 'Annotated host: Homo sapiens',
        value: `${human.toLocaleString()} (${pct(human)}%)`,
        note:
          human === 0
            ? 'No genome in this set carries a human host annotation. Absence of the annotation ' +
              'is not evidence the organism does not infect humans — host_name is sparsely ' +
              'populated across BV-BRC.'
            : 'Counted server-side across the whole collection, not sampled. The remainder is ' +
              'mostly genomes with NO host annotation rather than genomes from other hosts, ' +
              'so this is a floor, not a proportion of known hosts.',
      },
      {
        label: 'Complete genomes',
        value: `${complete.toLocaleString()} (${pct(complete)}%)`,
        note: 'BV-BRC\'s own genome_status field. The rest are partial assemblies.',
      },
      {
        label: 'Scope of this panel',
        value: 'Organism context only',
        note:
          'Host-directed work only, per the project scope. For host range and isolate ' +
          'metadata in depth, BV-BRC\'s own faceted browser is linked below — its facets ' +
          'are not reachable through the API.',
      },
    ];

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.bv-brc.org/view/Taxonomy/${encodeURIComponent(taxid)}#view_tab=genomes`,
      ...meta.get(),
    };
  },
};
