// GWAS Catalog associations for a gene.
//
// ──────────────────────────────────────────────────────────────────────────
// THE PARAMETER NAME HERE IS LOAD-BEARING. Measured 2026-11-05 (M4):
//
//   ?gene_name=SCN9A    -> 1,205,644 associations   (the ENTIRE catalogue)
//   ?gene_name=COMT     -> 1,205,644, byte-identical
//   ?gene_name=ZZZZQQQQ -> 1,205,644, byte-identical
//   (no filter at all)  -> 1,205,644, byte-identical
//
//   ?mapped_gene=SCN9A  -> 8      ?mapped_gene=ZZZZQQQQ -> 0
//
// `gene_name` is the parameter §6.1 recorded, and it is silently ignored: the
// API accepts it, returns 200, and hands back the whole catalogue. A connector
// built on it would have shown the same few arbitrary rows — "fetal hemoglobin
// measurement" — under every gene a researcher ever searched, and looked
// perfectly healthy doing it. This is the WikiPathways failure (§6.3) in a
// source we had already verified.
//
// `mapped_gene` is the working parameter. Because a filter that silently stops
// filtering is evidently possible here, run() does not trust it: every row is
// checked for our symbol in its own `mapped_genes`, and rows that fail are
// discarded and counted. If the filter breaks again the panel says so instead
// of presenting the catalogue's first page as the gene's associations.
// ──────────────────────────────────────────────────────────────────────────

import { fetchJson, NoEntry, Unavailable, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const API = 'https://www.ebi.ac.uk/gwas/rest/api/v2/associations';
const PAGE = 50;

interface Association {
  association_id?: number;
  p_value?: number;
  pvalue_mantissa?: number;
  pvalue_exponent?: number;
  beta?: string;
  risk_frequency?: string;
  mapped_genes?: string[];
  efo_traits?: { efo_id?: string; efo_trait?: string }[];
  reported_trait?: string[];
  snp_allele?: { rs_id?: string; effect_allele?: string }[];
  accession_id?: string;
  pubmed_id?: string;
  first_author?: string;
}

interface Response {
  _embedded?: { associations?: Association[] };
  page?: { totalElements?: number };
}

function rsids(a: Association): string[] {
  return (a.snp_allele ?? []).map((s) => s.rs_id).filter((x): x is string => Boolean(x));
}

function traits(a: Association): string[] {
  const efo = (a.efo_traits ?? []).map((t) => t.efo_trait).filter((x): x is string => Boolean(x));
  return efo.length ? efo : (a.reported_trait ?? []).filter(Boolean);
}

/**
 * p-values here routinely underflow IEEE-754 doubles.
 *
 * Measured on COMT: 6 of 50 associations carry `p_value: 0` — among them
 * rs4680, the Val158Met variant, whose true p-values are 3e-1416, 1e-2112 and
 * 4e-3035. Anything below ~5e-324 becomes 0.0 in a double, so `p_value` is
 * lossy precisely for the strongest results in the catalogue.
 *
 * Two consequences, both of which were live bugs:
 *   - displayed as "p = 0", which is not a p-value;
 *   - sorted as 0, tying the six most significant rows at the front in
 *     arbitrary order, so the ranking was meaningless where it mattered most.
 *
 * `pvalue_mantissa` and `pvalue_exponent` are integers and carry the real
 * value, so they are authoritative for both display and ordering. `p_value` is
 * only a fallback for rows that lack them.
 */
interface Pval {
  /** log10 of the p-value. Lower is more significant. Used for ordering. */
  log10: number;
  text: string;
}

function pvalue(a: Association): Pval | null {
  const m = a.pvalue_mantissa;
  const e = a.pvalue_exponent;
  if (typeof m === 'number' && m > 0 && typeof e === 'number') {
    return { log10: e + Math.log10(m), text: `${m}e${e}` };
  }
  // No mantissa/exponent: fall back to the float, which is usable as long as
  // it did not underflow. A bare 0 carries no information and is dropped
  // rather than printed as if it were a measurement.
  const p = a.p_value;
  if (typeof p === 'number' && p > 0) {
    const exp = Math.floor(Math.log10(p));
    return { log10: Math.log10(p), text: `${(p / 10 ** exp).toFixed(1)}e${exp}` };
  }
  return null;
}

export const gwascatalog: Connector = {
  id: 'gwascatalog',
  name: 'GWAS associations',
  source: 'GWAS Catalog',
  sourceUrl: 'https://www.ebi.ac.uk/gwas/',
  layer: 'evidence',
  requires: [['symbol']],
  presets: [],
  // The slowest source in the inventory, and the most variable by far.
  //
  // Re-measured 2026-11-06, COMT (101 matching associations), 3 runs per page
  // size — page size does NOT help, which rules out payload as the cause:
  //
  //   size=10   37.9s · 16.6s · 8.0s     <- widest spread, worst single time
  //   size=20   30.4s · 26.9s · 25.3s
  //   size=50   25.7s · 20.0s · 25.9s
  //
  // SCN9A (8 matching associations) runs 8.5–15.9s, so how many rows MATCH the
  // filter does seem to cost something, while how many are RETURNED does not.
  // Either way the variance dominates: this is queueing at the source.
  //
  // So we keep size=50 — it gives the best ranking at no latency cost — and
  // widen the budget instead. 25s sat in the middle of the distribution and
  // failed roughly half the time on COMT, which is the worst possible place
  // for a timeout to sit. Because panels load independently (§11.3) a slow one
  // delays nothing else, so a long budget costs only its own spinner, whereas
  // a coin-flip `unavailable` costs the researcher the data.
  timeoutMs: 45000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.symbol) throw new NoEntry('No gene symbol', meta.provenance());
    const symbol = ids.symbol;

    const { json } = meta.record(
      await fetchJson<Response>(
        `${API}?mapped_gene=${encodeURIComponent(symbol)}&size=${PAGE}`,
        { timeoutMs: this.timeoutMs, ttlMs: TTL.standard, emptyOn: [404] },
      ),
    );

    const total = json.page?.totalElements ?? 0;
    const returned = json._embedded?.associations ?? [];

    // The guard. `mapped_gene` is a filter we have already caught a sibling of
    // ignoring its input, so we verify its work rather than trusting it.
    const ours = returned.filter((a) =>
      (a.mapped_genes ?? []).some((g) => g.toUpperCase() === symbol.toUpperCase()),
    );
    const foreign = returned.length - ours.length;

    // Every row failing the check, with rows present, means the filter is not
    // filtering — the signature of the `gene_name` bug. That is a broken source,
    // not an absence of associations, so it must not render as `empty` (§5.4).
    if (returned.length > 0 && ours.length === 0) {
      throw new Unavailable(
        `GWAS Catalog returned ${returned.length} associations and none is mapped to ${symbol} ` +
          `(catalogue total reported: ${total.toLocaleString()}). The mapped_gene filter appears to ` +
          `be ignoring its input — see the header comment in lib/connectors/gwascatalog.ts.`,
        meta.provenance(),
      );
    }

    if (!total || !ours.length) {
      throw new NoEntry(`The GWAS Catalog has no association mapped to ${symbol}`, meta.provenance());
    }

    const scored = ours
      .map((a) => ({ a, p: pvalue(a) }))
      .filter((x): x is { a: Association; p: Pval } => x.p !== null)
      .sort((x, y) => x.p.log10 - y.p.log10);

    const facts: Fact[] = [
      {
        label: 'Associations',
        value: total.toLocaleString(),
        note:
          `Variants mapped to ${symbol} across all traits. ` +
          (total > returned.length
            ? `The strongest below are drawn from the first ${returned.length} returned, not from all ${total.toLocaleString()}. `
            : '') +
          `"Mapped" is positional — the variant sits in or near the gene, which is not evidence that this gene mediates the effect.`,
      },
    ];

    for (const { a, p } of scored.slice(0, 6)) {
      const t = traits(a);
      const rs = rsids(a);
      facts.push({
        label: t[0] ?? 'Unnamed trait',
        value: `p = ${p.text}${rs.length ? ` · ${rs.join(', ')}` : ''}`,
        href: a.accession_id
          ? `https://www.ebi.ac.uk/gwas/studies/${encodeURIComponent(a.accession_id)}`
          : undefined,
        note: [
          a.beta ? `Effect: ${a.beta}` : null,
          (a.mapped_genes ?? []).length > 1
            ? `Variant also maps to ${(a.mapped_genes ?? []).filter((g) => g.toUpperCase() !== symbol.toUpperCase()).join(', ')}`
            : null,
          a.first_author ? `${a.first_author}${a.pubmed_id ? `, PMID ${a.pubmed_id}` : ''}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      });
    }

    const noP = ours.length - scored.length;
    if (noP > 0) {
      facts.push({
        label: 'Without a usable p-value',
        value: `${noP} of ${ours.length}`,
        note: 'Omitted from the ranking above rather than shown with a placeholder value.',
      });
    }

    if (foreign > 0) {
      facts.push({
        label: 'Rows discarded',
        value: String(foreign),
        note: `Returned by the query but not mapped to ${symbol}. Excluded from everything above.`,
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.ebi.ac.uk/gwas/genes/${encodeURIComponent(symbol)}`,
      ...meta.get(),
    };
  },
};
