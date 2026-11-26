// Human Protein Atlas — the cell-type layer.
//
// Where GTEx gives bulk tissue medians, HPA gives single-cell-type and single-
// nuclei-brain enrichment, which is what the §1 question ("which cell types")
// actually needs. The two panels sit side by side on purpose: a gene can look
// unremarkable in bulk tissue and be strongly enriched in one cell type.
//
// Licence: CC BY-SA 3.0. Share-alike, so under §10.1 this is display-only —
// values are shown with attribution and a link, never redistributed as data.
//
// The JSON record is a flat object of ~119 keys whose names contain spaces and
// are the API's public contract ("RNA single cell type specific nCPM"). They
// are read through helpers rather than destructured, so a renamed key degrades
// to a missing fact instead of a crash.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

type HpaRecord = Record<string, unknown>;

function str(rec: HpaRecord, key: string): string | undefined {
  const v = rec[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Several HPA fields are `{ "Corticotrophs": "202.7", … }`. */
function topOf(rec: HpaRecord, key: string, n = 5): { label: string; value: number }[] {
  const v = rec[key];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>)
    .map(([label, raw]) => ({ label, value: Number(raw) }))
    .filter((e) => Number.isFinite(e.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

function fmt(entries: { label: string; value: number }[]): string {
  return entries.map((e) => `${e.label} (${e.value})`).join(' · ');
}

/**
 * One row per HPA "specificity / distribution / values" triplet.
 * `unit` is named because nTPM and nCPM are not interchangeable.
 */
const SECTIONS: { label: string; spec: string; dist: string; values: string; unit: string }[] = [
  {
    label: 'Tissue',
    spec: 'RNA tissue specificity',
    dist: 'RNA tissue distribution',
    values: 'RNA tissue specific nTPM',
    unit: 'nTPM',
  },
  {
    label: 'Single cell type',
    spec: 'RNA single cell type specificity',
    dist: 'RNA single cell type distribution',
    values: 'RNA single cell type specific nCPM',
    unit: 'nCPM',
  },
  {
    label: 'Brain (single nuclei)',
    spec: 'RNA single nuclei brain specificity',
    dist: 'RNA single nuclei brain distribution',
    values: 'RNA single nuclei brain specific nCPM',
    unit: 'nCPM',
  },
  {
    label: 'Blood cell',
    spec: 'RNA blood cell specificity',
    dist: 'RNA blood cell distribution',
    values: 'RNA blood cell specific nTPM',
    unit: 'nTPM',
  },
];

export const hpa: Connector = {
  id: 'hpa',
  name: 'Cell type enrichment',
  source: 'Human Protein Atlas',
  sourceUrl: 'https://www.proteinatlas.org/',
  layer: 'target',
  requires: [['ensemblGene']],
  presets: [],
  timeoutMs: 12000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.ensemblGene) throw new NoEntry('No Ensembl gene id', meta.provenance());

    // Unversioned ENSG only — the versioned GENCODE id is not a valid HPA path.
    const { json } = meta.record(
      await fetchJson<HpaRecord>(`https://www.proteinatlas.org/${ids.ensemblGene}.json`, {
        timeoutMs: this.timeoutMs,
        ttlMs: TTL.long,
        emptyOn: [404],
      }),
    );

    const gene = str(json, 'Gene');
    if (!gene) throw new NoEntry(`HPA has no record for ${ids.ensemblGene}`, meta.provenance());

    const facts: Fact[] = [];

    for (const s of SECTIONS) {
      const spec = str(json, s.spec);
      const dist = str(json, s.dist);
      const top = topOf(json, s.values);
      if (!spec && !dist && !top.length) continue;

      const parts = [spec, dist].filter(Boolean).join(' · ');
      facts.push({
        label: s.label,
        value: parts || '—',
        note: top.length
          ? `Enriched in: ${fmt(top)} (${s.unit}). HPA lists only the enriched entries here, not every ` +
            `cell type measured, so this is where the signal is concentrated rather than everywhere it occurs.`
          : undefined,
      });
    }

    if (!facts.length) {
      throw new NoEntry(`HPA has a record for ${gene} but no RNA specificity data`, meta.provenance());
    }

    const desc = str(json, 'Gene description');
    if (desc) facts.unshift({ label: 'Gene', value: desc });

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.proteinatlas.org/${ids.ensemblGene}-${encodeURIComponent(gene)}`,
      ...meta.get(),
      symbolSeen: gene,
    };
  },
};
