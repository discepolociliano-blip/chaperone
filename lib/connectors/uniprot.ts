// UniProt panel. PROJECT-PLAN.md §5.7: a connector is identifiers in,
// normalised panel data out. No rendering, no state, no id literals (§6.5).

import { byAccession, byEnsembl, bySymbol } from '../uniprot-record';
import { NoEntry } from '../http';
import type { Connector, Fact, Identifiers } from '../types';

/**
 * Query by the same route the resolver used, so this panel reuses the
 * resolver's cached response instead of making a second, equivalent call.
 *
 * Querying "best identifier first" looks tidier and costs an extra upstream
 * request on every cold lookup: the resolver fetched by symbol and cached
 * under that key, so asking by accession misses a cache that already holds
 * the answer (§5.3 — cache, and do not make work for public services).
 */
function fetchRecord(ids: Identifiers, timeoutMs: number) {
  switch (ids.kind) {
    case 'uniprot':
      if (ids.uniprot) return byAccession(ids.uniprot, timeoutMs);
      break;
    case 'ensembl':
      if (ids.ensemblGene) return byEnsembl(ids.ensemblGene, timeoutMs);
      break;
    default:
      break;
  }
  if (ids.symbol) return bySymbol(ids.symbol, timeoutMs);
  if (ids.uniprot) return byAccession(ids.uniprot, timeoutMs);
  return null;
}

export const uniprot: Connector = {
  id: 'uniprot',
  name: 'Protein identity',
  source: 'UniProt',
  sourceUrl: 'https://www.uniprot.org/',
  layer: 'target',
  requires: [['uniprot'], ['symbol']], // an accession, or failing that a symbol
  presets: [],
  timeoutMs: 10000,

  async run(ids) {
    const pending = fetchRecord(ids, this.timeoutMs);
    // No provenance to attach: nothing has been fetched at this point, so the
    // route's "now, uncached" default is the truthful answer.
    if (!pending) throw new NoEntry('No protein identifier to look up');
    const record = await pending;

    const facts: Fact[] = [];

    if (record.proteinName) facts.push({ label: 'Protein', value: record.proteinName });
    if (record.symbol) facts.push({ label: 'Gene', value: record.symbol });
    facts.push({
      label: 'Accession',
      value: record.accession,
      href: `https://www.uniprot.org/uniprotkb/${record.accession}`,
    });
    if (record.length) facts.push({ label: 'Length', value: `${record.length} aa` });

    if (record.subcellular.length) {
      facts.push({
        label: 'Subcellular location',
        value: record.subcellular.slice(0, 4).join(' · '),
        note: record.subcellular.length > 4 ? `${record.subcellular.length} locations annotated, showing 4` : undefined,
      });
    }

    // Cross-references matter here beyond display: these are the ids every
    // other connector runs on, so showing them makes a wrong resolution
    // visible rather than silent (§6.5).
    if (record.hgnc) {
      facts.push({
        label: 'HGNC',
        value: record.hgnc,
        href: `https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${record.hgnc}`,
      });
    }
    if (record.ncbiGene) {
      facts.push({
        label: 'NCBI Gene',
        value: record.ncbiGene,
        href: `https://www.ncbi.nlm.nih.gov/gene/${record.ncbiGene}`,
      });
    }
    if (record.transcripts.length) {
      facts.push({
        label: 'Ensembl transcripts',
        value: String(record.transcripts.length),
        note: record.transcripts.slice(0, 3).join(', '),
      });
    }

    if (record.functionText) {
      facts.push({
        label: 'Function',
        value: record.functionText.length > 400 ? `${record.functionText.slice(0, 400)}…` : record.functionText,
        note: 'UniProt curated annotation',
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.uniprot.org/uniprotkb/${record.accession}/entry`,
      fetchedAt: new Date(record.fetchedAt).toISOString(),
      cached: record.cached,
      symbolSeen: record.symbol,
    };
  },
};
