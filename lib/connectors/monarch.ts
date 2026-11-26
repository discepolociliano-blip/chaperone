// Monarch Initiative — gene to phenotype, keyed on the HGNC id.
//
// This is the connector that caught the §6.5 error. Passing HGNC:10596 instead
// of HGNC:10597 made Monarch return SCN8A — a different sodium channel on the
// same chromosome, plausible enough to pass a careless eye. Nothing errored.
//
// Two consequences, both still in force:
//   1. The HGNC id is never a literal; it comes from the resolver, via UniProt.
//   2. The entity call is made FOR the cross-check, not only for the label.
//      Monarch echoes the symbol it believes it answered about, and that goes
//      back as symbolSeen so a mismatch fails loudly (§7.6) rather than
//      rendering one gene's phenotypes under another gene's name.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const BASE = 'https://api-v3.monarchinitiative.org/v3/api';
const LIMIT = 150;

/**
 * Three categories, not one. Measured 2026-11-05 (M4): asking only for
 * GeneToPhenotypicFeatureAssociation reported "no phenotype association for
 * COMT" — while Monarch in fact held 292 associations for COMT, among them
 * 22q11.2 deletion syndrome. The category was simply the wrong question, and
 * the panel published our narrow query as the source's verdict.
 *
 * SCN9A: 67 phenotype + 5 causal + 7 correlated. COMT: 0 + 0 + 1.
 *
 * Causal and correlated are kept apart rather than summed. "This gene causes
 * this disease" and "variants here are correlated with it" are different
 * claims, and collapsing them is the kind of flattening §5.5 forbids.
 *
 * Monarch accepts the parameter repeated, so this stays one request.
 */
const CATEGORIES = [
  'biolink:GeneToPhenotypicFeatureAssociation',
  'biolink:CausalGeneToDiseaseAssociation',
  'biolink:CorrelatedGeneToDiseaseAssociation',
] as const;

interface Entity {
  id?: string;
  name?: string;
  symbol?: string;
  category?: string;
  in_taxon_label?: string;
  description?: string;
}

interface AssociationItem {
  subject?: string;
  subject_label?: string;
  object?: string;
  object_label?: string;
  predicate?: string;
  category?: string;
}

interface AssociationResponse {
  total?: number;
  items?: AssociationItem[];
}

export const monarch: Connector = {
  id: 'monarch',
  name: 'Gene–phenotype associations',
  source: 'Monarch Initiative',
  sourceUrl: 'https://monarchinitiative.org/',
  layer: 'condition',
  requires: [['hgnc']],
  presets: [],
  timeoutMs: 12000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.hgnc) throw new NoEntry('No HGNC id', meta.provenance());
    const hgnc = ids.hgnc;

    const { json: entity } = meta.record(
      await fetchJson<Entity>(`${BASE}/entity/${encodeURIComponent(hgnc)}`, {
        timeoutMs: this.timeoutMs,
        ttlMs: TTL.long,
        emptyOn: [404],
      }),
    );

    if (!entity.id) throw new NoEntry(`Monarch has no entity for ${hgnc}`, meta.provenance());

    // What Monarch thinks this id is. The whole point of the call.
    const seen = entity.symbol ?? entity.name;

    const categoryParams = CATEGORIES.map((c) => `&category=${encodeURIComponent(c)}`).join('');

    const { json: assoc } = meta.record(
      await fetchJson<AssociationResponse>(
        `${BASE}/association?subject=${encodeURIComponent(hgnc)}${categoryParams}&limit=${LIMIT}`,
        { timeoutMs: this.timeoutMs, ttlMs: TTL.standard, emptyOn: [404] },
      ),
    );

    const total = assoc.total ?? 0;
    const items = (assoc.items ?? []).filter((i) => i.object_label);

    const of = (suffix: string): string[] => [
      ...new Set(
        items
          .filter((i) => (i.category ?? '').endsWith(suffix))
          .map((i) => i.object_label)
          .filter((x): x is string => Boolean(x)),
      ),
    ];

    const phenotypes = of('GeneToPhenotypicFeatureAssociation');
    const causal = of('CausalGeneToDiseaseAssociation');

    // Monarch can hold both a causal and a correlated edge for the same
    // disease. Listing it under both would show the weaker claim beside the
    // stronger one as if they were separate findings, so once a disease is
    // asserted causal it is not repeated as merely correlated.
    const causalSet = new Set(causal.map((d) => d.toLowerCase()));
    const correlated = of('CorrelatedGeneToDiseaseAssociation').filter(
      (d) => !causalSet.has(d.toLowerCase()),
    );

    const facts: Fact[] = [
      {
        label: 'Identified as',
        value: `${seen ?? '—'}${entity.in_taxon_label ? ` · ${entity.in_taxon_label}` : ''}`,
        note: `Monarch's own reading of ${hgnc}. Shown so a wrong id is visible rather than silent.`,
      },
    ];

    if (!phenotypes.length && !causal.length && !correlated.length) {
      throw new NoEntry(
        `Monarch records no disease or phenotype association for ${seen ?? hgnc}`,
        meta.provenance(),
      );
    }

    if (causal.length) {
      facts.push({
        label: 'Causal for',
        value: causal.slice(0, 6).join(' · '),
        note:
          'Monarch asserts this gene causes these diseases — the strongest claim in this panel.' +
          (causal.length > 6 ? ` Showing 6 of ${causal.length}.` : ''),
      });
    }

    if (correlated.length) {
      facts.push({
        label: 'Correlated with',
        value: correlated.slice(0, 6).join(' · '),
        note:
          'Associated but not asserted as causal — a weaker claim than the causal row, and ' +
          'deliberately not merged with it. Diseases already listed as causal are excluded here.' +
          (correlated.length > 6 ? ` Showing 6 of ${correlated.length}.` : ''),
      });
    }

    if (phenotypes.length) {
      facts.push({
        label: 'Phenotypes',
        value: phenotypes.slice(0, 10).join(' · '),
        note:
          `${phenotypes.length} term${phenotypes.length === 1 ? '' : 's'}, pooled across every ` +
          `disease above. They are not all features of any one patient or condition.` +
          (phenotypes.length > 10 ? ` Showing 10 of ${phenotypes.length}.` : ''),
      });
    }

    facts.push({
      label: 'Associations retrieved',
      value: `${items.length} of ${total.toLocaleString()}`,
      note:
        'Counting gene-to-phenotype, causal gene-to-disease and correlated gene-to-disease. ' +
        'Monarch holds other association types for this gene — interactions, pathways, ' +
        'expression sites — which other panels cover.',
    });

    return {
      state: 'data',
      facts,
      recordUrl: `https://monarchinitiative.org/${encodeURIComponent(hgnc)}`,
      ...meta.get(),
      symbolSeen: seen,
    };
  },
};
