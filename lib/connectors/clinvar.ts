// ClinVar counts via NCBI E-utilities.
//
// Two serial searches, not concurrent: §5.3 caps us at 3 req/s keyless against
// NCBI, and a burst to one provider is exactly what that rule forbids.
//
// §5.5: these are counts we derived from a search, not a figure ClinVar
// publishes, and the panel says so. A submission count is not an assertion
// that a gene is disease-causing — well-studied genes accumulate submissions.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const ESEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';

interface ESearchResponse {
  esearchresult?: { count?: string; errorlist?: unknown };
}

function keyParam(): string {
  const k = process.env.NCBI_API_KEY;
  return k ? `&api_key=${encodeURIComponent(k)}` : '';
}

async function count(term: string, timeoutMs: number, meta: FetchMeta): Promise<number> {
  const url = `${ESEARCH}?db=clinvar&term=${encodeURIComponent(term)}&retmode=json&retmax=0${keyParam()}`;
  const { json } = meta.record(await fetchJson<ESearchResponse>(url, {
    timeoutMs,
    ttlMs: TTL.standard,
    cacheKey: `clinvar ${term}`,
  }));
  const n = Number(json.esearchresult?.count ?? NaN);
  if (!Number.isFinite(n)) throw new NoEntry('ClinVar returned no count', meta.provenance());
  return n;
}

export const clinvar: Connector = {
  id: 'clinvar',
  name: 'Clinical variants',
  source: 'ClinVar',
  sourceUrl: 'https://www.ncbi.nlm.nih.gov/clinvar/',
  layer: 'condition',
  requires: [['symbol']],
  presets: [],
  timeoutMs: 10000,
  // Keyless works; a key only widens the rate limit, so this is not envKey-gated.

  async run(ids, ctx) {
    const meta = new FetchMeta();
    if (!ids.symbol) throw new NoEntry('No gene symbol', meta.provenance());

    // §11.8: an applied filter narrows the SEARCH, not the display. The clause
    // joins the gene term so every count below is computed inside the filter,
    // and the record link carries the same term so the source shows the same
    // set. Both ClinVar filters are E-utilities term clauses, so they compose.
    const clause = ctx.filter?.value ? ` AND ${ctx.filter.value}` : '';
    const scope = `${ids.symbol}[gene]${clause}`;

    const total = await count(scope, this.timeoutMs, meta);
    if (total === 0) {
      // Inside a filter, zero is the filter's answer, not ClinVar's silence
      // about the gene — those are different claims (§5.4).
      throw new NoEntry(
        clause
          ? `ClinVar has submissions for ${ids.symbol}, but none matching this filter`
          : `ClinVar has no submissions for ${ids.symbol}`,
        meta.provenance(),
      );
    }

    const facts: Fact[] = [
      {
        label: clause ? 'Records matching this filter' : 'Submitted records',
        value: total.toLocaleString(),
        ...(clause ? { note: 'Every figure in this panel is counted inside the active filter.' } : {}),
      },
    ];

    // Inside a filter, a count on its own has no scale: 180 is small for a
    // channel and large for a gene nobody has sequenced. The unfiltered total
    // is what makes it readable, so it is fetched and the share stated.
    if (clause) {
      const unfiltered = await count(`${ids.symbol}[gene]`, this.timeoutMs, meta);
      if (unfiltered > 0) {
        facts.push({
          label: 'Share of all submissions',
          value: `${total.toLocaleString()} of ${unfiltered.toLocaleString()} (${((total / unfiltered) * 100).toFixed(1)}%)`,
          note: 'How much of this gene the filter selected. The denominator is every ClinVar submission for the gene.',
        });
      }
    }

    // The clinical-significance breakdown, which is the point of the panel when
    // nothing is filtered — and is TAUTOLOGICAL when the active filter is
    // significance itself. Counting pathogenic records inside a pathogenic-only
    // search returns 100.0%, a figure that looks like a finding and is nothing
    // but the filter reflected back. It is suppressed there, and kept under the
    // review-status filter, where "what share of three-star records are
    // pathogenic" is a real question.
    const selfReferential = ctx.filter?.filterId === 'clinvar-significance';
    if (!selfReferential) {
      const pathogenic = await count(
        `${scope} AND ("clinsig pathogenic"[Properties] OR "clinsig likely pathogenic"[Properties])`,
        this.timeoutMs,
        meta,
      );

      const vus = await count(`${scope} AND "clinsig vus"[Properties]`, this.timeoutMs, meta);

      facts.push({
        label: 'Pathogenic or likely pathogenic',
        value: `${pathogenic.toLocaleString()} (${((pathogenic / total) * 100).toFixed(1)}%)`,
        note: 'Counts derived from a ClinVar search, not a published figure. Submission volume tracks how well studied a gene is.',
      });

      if (vus > 0) {
        facts.push({
          label: 'Uncertain significance',
          value: `${vus.toLocaleString()} (${((vus / total) * 100).toFixed(1)}%)`,
          note: 'A large VUS fraction means most variants in this gene cannot yet be interpreted.',
        });
      }
    }

    return {
      state: 'data',
      facts,
      // The link carries the filter too, so the source shows the same set the
      // panel counted. A link that drops the filter would send the researcher
      // to a different, larger answer than the one they are looking at.
      recordUrl: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(scope)}`,
      ...meta.get(),
      symbolSeen: ids.symbol,
    };
  },
};
