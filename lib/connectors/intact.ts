// IntAct physical interactions.
//
// Queried by UniProt accession, never by gene symbol. Measured during M3:
// findInteractions/SCN9A returns MOUSE interactions (hdac4_mouse,
// scn9a_mouse) because symbol search is cross-species, and the documented
// speciesAFilter/speciesBFilter parameters did not filter them out. The
// accession is species-specific by construction, so it is the only safe key.
//
// Unlike STRING these are reported experimental interactions, not functional
// association scores — the panel says which it is.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const WS = 'https://www.ebi.ac.uk/intact/ws/interaction/findInteractions';

interface IntactRow {
  moleculeA?: string;
  moleculeB?: string;
  uniqueIdA?: string;
  uniqueIdB?: string;
  intactNameA?: string;
  intactNameB?: string;
  type?: string;
  detectionMethod?: string;
}

interface IntactResponse {
  content?: IntactRow[];
  totalElements?: number;
}

/** "Q15858-2" and "Q15858" are the same protein for our purposes. */
function sameProtein(id: string | undefined, accession: string): boolean {
  if (!id) return false;
  return (id.split('-')[0] ?? id).toUpperCase() === accession.toUpperCase();
}

export const intact: Connector = {
  id: 'intact',
  name: 'Physical interactions',
  source: 'IntAct',
  sourceUrl: 'https://www.ebi.ac.uk/intact/',
  layer: 'target',
  requires: [['uniprot']],
  presets: [],
  timeoutMs: 10000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.uniprot) throw new NoEntry('No UniProt accession', meta.provenance());

    const { json } = meta.record(await fetchJson<IntactResponse>(
      `${WS}/${ids.uniprot}?page=0&pageSize=50`,
      { timeoutMs: this.timeoutMs, ttlMs: TTL.standard, emptyOn: [404] },
    ));

    const total = json.totalElements ?? 0;
    const rows = json.content ?? [];
    if (!total || !rows.length) throw new NoEntry(`IntAct reports no interactions for ${ids.uniprot}`, meta.provenance());

    // Name the other party in each pair, from our accession's point of view.
    const partners = new Map<string, number>();
    for (const row of rows) {
      const aIsUs = sameProtein(row.uniqueIdA, ids.uniprot);
      const bIsUs = sameProtein(row.uniqueIdB, ids.uniprot);
      const other = aIsUs ? row.moleculeB : bIsUs ? row.moleculeA : null;
      if (other) partners.set(other, (partners.get(other) ?? 0) + 1);
    }

    const ranked = [...partners.entries()].sort((a, b) => b[1] - a[1]);

    const facts: Fact[] = [
      {
        label: 'Reported interactions',
        value: total.toLocaleString(),
        note: 'Curated from published experiments. One pair can be reported many times.',
      },
    ];

    if (ranked.length) {
      const scope =
        total > rows.length ? `Counted from the first ${rows.length} of ${total} records. ` : '';
      facts.push({
        label: 'Partners',
        value: ranked
          .slice(0, 8)
          .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
          .join(' · '),
        // Querying by accession pins OUR side of each pair to the right human
        // protein, but the partner can be anything IntAct has recorded binding
        // to it — including viral proteins. SCN9A returns an HPV E5 protein.
        // That is real data and useful, but it must not read as a human
        // interactome.
        note: `${scope}Partners are whatever IntAct records binding to this protein, which can include viral and other non-human proteins.`,
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.ebi.ac.uk/intact/search?query=${encodeURIComponent(ids.uniprot)}`,
      ...meta.get(),
    };
  },
};
