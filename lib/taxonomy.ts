// Organism resolution via NCBI Taxonomy.
//
// §11.6 scopes the pathogen panels to "organism identification and context",
// so their subject is an organism, not a human gene. This supplies the taxid
// those panels run on, derived rather than written down (§6.5).
//
// Measured 2026-11-06 — esearch discriminates cleanly, which is what makes it
// safe to run speculatively on any free-text query:
//
//   "SARS-CoV-2"        -> 1 hit, taxid 2697049
//   "influenza A virus" -> 1 hit, taxid 11320
//   "Zika virus"        -> 1 hit, taxid 64320
//   "neuropathic pain"  -> 0 hits
//   "ZZZZQQQQ"          -> 0 hits
//
// A trait name returning zero is exactly what lets free text be tried as both
// a trait and an organism without one answer contaminating the other.

import { fetchJson, NoEntry, FetchMeta } from './http';
import { TTL } from './cache';

const E = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

interface ESearchResponse {
  esearchresult?: { count?: string; idlist?: string[] };
}

interface TaxonRecord {
  scientificname?: string;
  commonname?: string;
  rank?: string;
  division?: string;
  genus?: string;
  species?: string;
}

interface ESummaryResponse {
  result?: Record<string, TaxonRecord | string[]>;
}

export interface Organism {
  taxid: string;
  name: string;
  commonName?: string;
  rank?: string;
  division?: string;
}

function apiKeyParam(): string {
  const k = process.env.NCBI_API_KEY;
  return k ? `&api_key=${encodeURIComponent(k)}` : '';
}

/**
 * Resolves free text to one organism, or throws NoEntry.
 *
 * Two calls: esearch for the id, esummary for the name, rank and division. The
 * name is fetched rather than echoed back from the query so the panel can show
 * what NCBI thinks it matched — "SARS-CoV-2" resolving to "Severe acute
 * respiratory syndrome coronavirus 2" is information the researcher should see,
 * and a wrong match becomes visible instead of silent (§6.5).
 */
export async function resolveOrganism(
  text: string,
  timeoutMs = 12000,
  meta?: FetchMeta,
): Promise<Organism> {
  const search = await fetchJson<ESearchResponse>(
    `${E}/esearch.fcgi?db=taxonomy&term=${encodeURIComponent(text)}&retmode=json&retmax=2${apiKeyParam()}`,
    { timeoutMs, ttlMs: TTL.long },
  );
  meta?.record(search);

  const ids = search.json.esearchresult?.idlist ?? [];
  const taxid = ids[0];
  if (!taxid) throw new NoEntry(`NCBI Taxonomy has no organism called "${text}"`);

  const summary = await fetchJson<ESummaryResponse>(
    `${E}/esummary.fcgi?db=taxonomy&id=${encodeURIComponent(taxid)}&retmode=json${apiKeyParam()}`,
    { timeoutMs, ttlMs: TTL.long },
  );
  meta?.record(summary);

  const rec = summary.json.result?.[taxid];
  if (!rec || Array.isArray(rec) || !rec.scientificname) {
    throw new NoEntry(`NCBI Taxonomy returned no record for taxid ${taxid}`);
  }

  return {
    taxid,
    name: rec.scientificname,
    commonName: rec.commonname || undefined,
    rank: rec.rank || undefined,
    division: rec.division || undefined,
  };
}
