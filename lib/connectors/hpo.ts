// Human Phenotype Ontology — the diseases a gene is annotated to, and the
// phenotype terms those diseases carry.
//
// §6.1 recorded this as a two-step lookup: search/gene?q={symbol} to get the
// NCBIGene id, then annotation/NCBIGene:{id}. The first step is unnecessary
// here — the resolver already holds the NCBI GeneID from UniProt, which is a
// better-derived id than a name search would return (§6.5). One call.
//
// Known gap, recorded deliberately: the annotation endpoint does not echo a
// gene symbol, so this panel cannot supply `symbolSeen` and is not covered by
// the §7.6 cross-check. Its id comes from the same UniProt chain as `symbol`,
// so a check would largely be UniProt agreeing with itself — but the gap is
// real and worth knowing when reading a disagreement elsewhere.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const API = 'https://ontology.jax.org/api/network/annotation';

// ─────────────────────────────────────────────────────────────────────────
// THE HPO LICENCE REQUIRES A VERSION, AND THE HPO API DOES NOT PROVIDE ONE.
//
// Re-read 2026-11-06 (§5.6, gate-5 item). The licence permits commercial use,
// but on three conditions, and one of them is a hard obligation on anything
// that displays HPO content:
//
//   "That any HPO Consortium file(s) displayed publicly include the date(s)
//    and/or version number(s) of the relevant HPO file(s)."
//
// The annotation endpoint we use returns exactly two keys, `diseases` and
// `phenotypes` — no version anywhere, and ontology.jax.org has no version
// route (the "2.1.5" in its footer is the web app, not the ontology release).
// So the release has to come from somewhere else: EBI's OLS4 publishes it as
// ontology metadata. Measured 2026-11-06: release 2026-09-01.
//
// This is an obligation, not a nicety, so a missing version is SAID rather
// than omitted — showing HPO data with no version silently breaks the terms,
// and §5.5 would rather state the gap.
//
// The licence also requires an acknowledgement statement and logo in the
// product's online presence. That is an interface obligation, recorded for M8.
// ─────────────────────────────────────────────────────────────────────────
const OLS_HP = 'https://www.ebi.ac.uk/ols4/api/ontologies/hp';

interface OlsOntology {
  config?: { version?: string; versionIri?: string };
}

async function hpoRelease(timeoutMs: number, meta: FetchMeta): Promise<string | undefined> {
  try {
    const r = await fetchJson<OlsOntology>(OLS_HP, { timeoutMs, ttlMs: TTL.long });
    meta.record(r);
    return r.json.config?.version ?? r.json.config?.versionIri;
  } catch {
    return undefined;
  }
}

interface Disease {
  id?: string;
  name?: string;
  mondoId?: string;
  description?: string;
}

interface Phenotype {
  id?: string;
  name?: string;
}

interface Annotation {
  diseases?: Disease[];
  phenotypes?: Phenotype[];
}

export const hpo: Connector = {
  id: 'hpo',
  name: 'Phenotypes & diseases',
  source: 'Human Phenotype Ontology',
  sourceUrl: 'https://hpo.jax.org/',
  layer: 'condition',
  requires: [['ncbiGene']],
  presets: [],
  timeoutMs: 12000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.ncbiGene) throw new NoEntry('No NCBI Gene id', meta.provenance());

    const { json } = meta.record(
      await fetchJson<Annotation>(`${API}/NCBIGene:${encodeURIComponent(ids.ncbiGene)}`, {
        timeoutMs: this.timeoutMs,
        ttlMs: TTL.long,
        emptyOn: [404],
      }),
    );

    const rawDiseases = (json.diseases ?? []).filter((d) => d.name);
    const phenotypes = (json.phenotypes ?? []).filter((p) => p.name);

    // HPO lists one disease once per nomenclature. SCN9A returns 9 entries that
    // are fewer distinct diseases: "Paroxysmal extreme pain disorder" appears as
    // both OMIM:167400 and ORPHA:46348, and "Primary erythromelalgia" and
    // "Erythermalgia, primary" are both MONDO:0007571. Reporting the entry count
    // as a disease count inflates it, so entries are grouped by MONDO id and
    // every source id is kept visible on the surviving row (§5.5).
    const byConcept = new Map<string, { names: string[]; ids: string[] }>();
    for (const d of rawDiseases) {
      const key = d.mondoId ?? d.id ?? d.name ?? '';
      const entry = byConcept.get(key) ?? { names: [], ids: [] };
      if (d.name && !entry.names.includes(d.name)) entry.names.push(d.name);
      if (d.id) entry.ids.push(d.id);
      if (d.mondoId && !entry.ids.includes(d.mondoId)) entry.ids.push(d.mondoId);
      byConcept.set(key, entry);
    }
    const diseases = [...byConcept.entries()].map(([key, v]) => ({
      key,
      name: v.names[0] ?? key,
      aliases: v.names.slice(1),
      ids: v.ids,
      mondoId: key.startsWith('MONDO') ? key : undefined,
    }));
    const collapsed = rawDiseases.length - diseases.length;

    if (!diseases.length && !phenotypes.length) {
      throw new NoEntry(`HPO has no annotation for NCBIGene:${ids.ncbiGene}`, meta.provenance());
    }

    const facts: Fact[] = [];

    if (diseases.length) {
      facts.push({
        label: 'Diseases annotated to this gene',
        value: String(diseases.length),
        note:
          'Mendelian disease entries from OMIM and Orphanet, curated for HPO.' +
          (collapsed > 0
            ? ` HPO returned ${rawDiseases.length} entries; ${collapsed} were the same disease ` +
              `under a second nomenclature and have been merged, so this is the distinct count.`
            : ''),
      });
      for (const d of diseases.slice(0, 6)) {
        facts.push({
          label: d.name,
          value: d.ids.join(' · ') || '—',
          href: d.mondoId
            ? `https://monarchinitiative.org/${encodeURIComponent(d.mondoId)}`
            : undefined,
          note: d.aliases.length ? `Also listed as: ${d.aliases.join('; ')}` : undefined,
        });
      }
      if (diseases.length > 6) {
        facts.push({ label: 'Further diseases', value: `${diseases.length - 6} more` });
      }
    }

    if (phenotypes.length) {
      facts.push({
        label: 'Phenotype terms',
        value: String(phenotypes.length),
        note:
          'The union across every disease above, so these terms do not co-occur in one ' +
          'patient and are not ranked by frequency.',
      });
      facts.push({
        label: 'Terms',
        value: phenotypes
          .slice(0, 12)
          .map((p) => p.name)
          .join(' · '),
        note: phenotypes.length > 12 ? `Showing 12 of ${phenotypes.length}.` : undefined,
      });
    }

    // Required by the HPO licence whenever HPO content is displayed. See the
    // note at the top of this file: stated as missing rather than omitted.
    const release = await hpoRelease(this.timeoutMs, meta);
    facts.push({
      label: 'HPO release',
      value: release ?? 'unknown',
      note: release
        ? 'The HPO licence requires the version of any HPO content shown publicly. Retrieved from ' +
          'EBI OLS4, because the HPO annotation API does not report its own release.'
        : 'Could not be retrieved. The HPO licence requires it to be displayed, so its absence is ' +
          'stated here rather than passed over — treat the data above as of unknown vintage.',
    });

    return {
      state: 'data',
      facts,
      // HPO's browser wants the full CURIE, not the bare Entrez id. Measured
      // 2026-11-06: /browse/gene/6335 renders "Could not find requested entrez
      // id 6335", while /browse/gene/NCBIGene:6335 renders the gene. Both are
      // served with HTTP 404 — the site returns 404 for every client-rendered
      // route, working ones included — so the status could not tell these two
      // apart and this had to be checked by eye. See the M7 findings.
      recordUrl: `https://hpo.jax.org/browse/gene/NCBIGene:${encodeURIComponent(ids.ncbiGene)}`,
      ...meta.get(),
    };
  },
};
