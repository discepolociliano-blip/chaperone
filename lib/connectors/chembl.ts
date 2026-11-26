// ChEMBL targets for a protein.
//
// Keyed on the UniProt accession via target_components__accession, which is
// exact. ChEMBL is the slowest source in the inventory and its latency swings
// by an order of magnitude between calls (measured 0.4s to over 12s), so it
// gets a wider budget than anything else and leans on the cache.
//
// §5.5: a ChEMBL target existing means compounds have been tested against it,
// not that the protein is druggable. The panel says so rather than implying
// tractability.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const API = 'https://www.ebi.ac.uk/chembl/api/data/target.json';

interface ChemblTargetRow {
  target_chembl_id?: string;
  pref_name?: string;
  target_type?: string;
  organism?: string;
}

interface ChemblTargetSearch {
  page_meta?: { total_count?: number };
  targets?: ChemblTargetRow[];
}

export const chembl: Connector = {
  id: 'chembl',
  name: 'Compound targets',
  source: 'ChEMBL',
  sourceUrl: 'https://www.ebi.ac.uk/chembl/',
  layer: 'drug',
  requires: [['uniprot']],
  presets: [],
  timeoutMs: 20000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.uniprot) throw new NoEntry('No UniProt accession', meta.provenance());

    const url =
      `${API}?target_components__accession=${encodeURIComponent(ids.uniprot)}` +
      `&only=target_chembl_id,pref_name,target_type,organism&limit=20`;

    const { json } = meta.record(await fetchJson<ChemblTargetSearch>(url, {
      timeoutMs: this.timeoutMs,
      ttlMs: TTL.long,
      emptyOn: [404],
    }));

    const targets = (json.targets ?? []).filter((t) => t.target_chembl_id);
    if (!targets.length) throw new NoEntry(`ChEMBL has no target containing ${ids.uniprot}`, meta.provenance());

    const human = targets.filter((t) => t.organism === 'Homo sapiens');
    const single = targets.filter((t) => t.target_type === 'SINGLE PROTEIN');

    const facts: Fact[] = [
      {
        label: 'ChEMBL targets',
        value: String(json.page_meta?.total_count ?? targets.length),
        note: 'A target exists where compounds have been tested against this protein. It is not a claim that the protein is druggable.',
      },
    ];

    // The single-protein target is the one a researcher usually wants; the
    // complexes and families are the same protein in other company.
    const primary = single[0] ?? human[0] ?? targets[0];
    if (primary) {
      facts.push({
        label: 'Primary target',
        value: `${primary.pref_name ?? primary.target_chembl_id} (${primary.target_type?.toLowerCase() ?? 'unknown type'})`,
        href: `https://www.ebi.ac.uk/chembl/target_report_card/${primary.target_chembl_id}/`,
      });
    }

    const others = targets.filter((t) => t.target_chembl_id !== primary?.target_chembl_id);
    if (others.length) {
      facts.push({
        label: 'Also appears in',
        value: others
          .slice(0, 5)
          .map((t) => `${t.pref_name ?? t.target_chembl_id}`)
          .join(' · '),
        note: 'Protein families and complexes containing this protein.',
      });
    }

    if (targets.length !== human.length) {
      facts.push({
        label: 'Non-human targets',
        value: String(targets.length - human.length),
        note: 'Same accession appearing in targets annotated to other organisms.',
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: primary?.target_chembl_id
        ? `https://www.ebi.ac.uk/chembl/target_report_card/${primary.target_chembl_id}/`
        : undefined,
      ...meta.get(),
    };
  },
};
