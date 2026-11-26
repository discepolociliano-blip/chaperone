// gnomAD constraint. PROJECT-PLAN.md §5.5 — constraint metrics are widely
// misread, so the panel states what they mean rather than printing bare numbers.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const API = 'https://gnomad.broadinstitute.org/api';

interface GnomadResponse {
  data?: {
    gene?: {
      gene_id?: string;
      symbol?: string;
      gnomad_constraint?: {
        pLI?: number | null;
        oe_lof?: number | null;
        oe_lof_upper?: number | null;
        mis_z?: number | null;
      } | null;
    } | null;
  };
  errors?: { message?: string }[];
}

function fmt(n: number | null | undefined, digits = 3): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : null;
}

export const gnomad: Connector = {
  id: 'gnomad',
  name: 'Constraint',
  source: 'gnomAD',
  sourceUrl: 'https://gnomad.broadinstitute.org/',
  layer: 'mechanism',
  requires: [['symbol']],
  presets: [],
  timeoutMs: 10000,

  async run(ids, ctx) {
    const meta = new FetchMeta();
    if (!ids.symbol) throw new NoEntry('No gene symbol', meta.provenance());

    // §11.8: which gnomAD release the constraint comes from. Probed to matter —
    // SCN9A's o/e LoF is 0.7005 on GRCh38 (v4) and 0.5489 on GRCh37 (v2.1),
    // the same gene with two defensible numbers. Most published LOEUF values
    // are v2, so comparing our figure to a paper requires choosing.
    const release = ctx.filter?.filterId === 'gnomad-release' ? ctx.filter.value : 'gnomad_r4';
    const genome = release === 'gnomad_r2_1' ? 'GRCh37' : 'GRCh38';

    const { json } = meta.record(await fetchJson<GnomadResponse>(API, {
      timeoutMs: this.timeoutMs,
      ttlMs: TTL.long,
      method: 'POST',
      body: {
        query: `query Constraint($symbol: String!) {
          gene(gene_symbol: $symbol, reference_genome: ${genome}) {
            gene_id
            symbol
            gnomad_constraint { pLI oe_lof oe_lof_upper mis_z }
          }
        }`,
        variables: { symbol: ids.symbol },
      },
      cacheKey: `gnomad-constraint ${ids.symbol} ${genome}`,
    }));

    const gene = json.data?.gene;
    if (!gene) throw new NoEntry(`gnomAD has no gene record for ${ids.symbol}`, meta.provenance());

    const c = gene.gnomad_constraint;
    if (!c) {
      throw new NoEntry(`gnomAD has ${gene.symbol ?? ids.symbol} but no constraint metrics for it`, meta.provenance());
    }

    const facts: Fact[] = [];

    const loeuf = fmt(c.oe_lof_upper);
    if (loeuf) {
      facts.push({
        label: 'LOEUF',
        value: loeuf,
        // LOEUF is the metric gnomAD itself recommends over pLI; the threshold
        // is a convention, not a cliff, so it is described rather than applied.
        note:
          Number(loeuf) < 0.35
            ? 'Below 0.35 — strongly intolerant of loss of function. A poor target to inhibit.'
            : Number(loeuf) > 1
              ? 'Above 1 — loss of function appears tolerated.'
              : 'Mid-range. Neither clearly constrained nor clearly tolerant.',
      });
    }

    const pli = fmt(c.pLI);
    if (pli) {
      facts.push({
        label: 'pLI',
        value: pli,
        note: 'Probability of intolerance to a single loss-of-function allele. gnomAD now recommends LOEUF over pLI.',
      });
    }

    const oe = fmt(c.oe_lof);
    if (oe) facts.push({ label: 'o/e (LoF)', value: oe, note: 'Observed over expected loss-of-function variants.' });

    const misZ = fmt(c.mis_z, 2);
    if (misZ) facts.push({ label: 'Missense Z', value: misZ, note: 'Higher means missense variation is depleted.' });

    if (!facts.length) throw new NoEntry('Constraint record present but every metric was null', meta.provenance());

    // Which release produced these numbers, stated on the panel rather than
    // left to the filter bar — a LOEUF without its release is not comparable
    // to the one in the paper you are reading (§6.5).
    facts.push({
      label: 'Release',
      value: release === 'gnomad_r2_1' ? 'gnomAD v2.1.1 · GRCh37' : 'gnomAD v4 · GRCh38',
      note:
        release === 'gnomad_r2_1'
          ? 'The legacy release most published constraint figures cite. Chaperone defaults to v4; you selected this one.'
          : 'Chaperone defaults to v4. Most published LOEUF values are v2.1.1, which reports different numbers for the same gene.',
    });

    return {
      state: 'data',
      facts,
      recordUrl: gene.gene_id
        ? `https://gnomad.broadinstitute.org/gene/${gene.gene_id}?dataset=${release}`
        : undefined,
      ...meta.get(),
      symbolSeen: gene.symbol ?? undefined,
    };
  },
};
