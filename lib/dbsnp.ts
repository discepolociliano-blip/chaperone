// rsID resolution via NCBI E-utilities. PROJECT-PLAN.md §6.5 — this replaces
// Ensembl's variation endpoint, which returned 503 and then timed out at 25s
// during gate 1.
//
// Rate: 3 req/s keyless, 10 with NCBI_API_KEY (§5.3). The key is optional and
// only widens the limit; nothing here needs it.

import { fetchJson, NoEntry, FetchMeta } from './http';
import { TTL } from './cache';
import type { VariantInfo } from './types';

const ESUMMARY = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const GWAS_SNP = 'https://www.ebi.ac.uk/gwas/rest/api/v2/single-nucleotide-polymorphisms';

interface DbSnpRecord {
  snp_id?: number;
  chrpos?: string;
  spdi?: string;
  snp_class?: string;
  clinical_significance?: string;
  genes?: { name?: string; gene_id?: string }[];
  global_mafs?: { study?: string; freq?: string }[];
}

interface ESummaryResponse {
  result?: Record<string, DbSnpRecord | string[]>;
}

interface GwasSnp {
  rs_id?: string;
  mapped_genes?: string[];
  functional_class?: string;
}

function apiKeyParam(): string {
  const k = process.env.NCBI_API_KEY;
  return k ? `&api_key=${encodeURIComponent(k)}` : '';
}

/** Alleles are easier to read off the SPDI string than to reconstruct. */
function allelesFromSpdi(spdi?: string): string | undefined {
  if (!spdi) return undefined;
  const parts = spdi.split(',').map((s) => s.split(':').slice(2).join('>'));
  return [...new Set(parts)].join(', ') || undefined;
}

/**
 * dbSNP reports many per-study frequencies. Showing all of them is noise;
 * picking one silently is a choice the researcher cannot see. We take the
 * study with the largest sample, which is encoded after the "/" in freq, and
 * label it with its study name so the provenance stays on screen.
 */
function largestStudyMaf(mafs?: { study?: string; freq?: string }[]): string | undefined {
  if (!mafs?.length) return undefined;
  let best: { study: string; freq: string; n: number } | null = null;
  for (const m of mafs) {
    if (!m.freq || !m.study) continue;
    const n = Number(m.freq.split('/')[1] ?? 0);
    if (!best || n > best.n) best = { study: m.study, freq: m.freq.split('/')[0] ?? m.freq, n };
  }
  return best ? `${best.freq} (${best.study}, n=${best.n})` : undefined;
}

/**
 * Gene context when dbSNP has none — verified during gate 1 on rs1333049.
 *
 * Note this is the SNP endpoint, addressed by path. M4 found that the sibling
 * `/associations?gene_name=` query filter is silently ignored; a path-addressed
 * lookup cannot fail that way, and this one was re-verified: rs1333049 → 200,
 * rs6746030 → 404.
 */
async function mappedGenesFromGwasCatalog(
  rsid: string,
  timeoutMs: number,
  meta?: FetchMeta,
): Promise<string[]> {
  try {
    const result = await fetchJson<GwasSnp>(`${GWAS_SNP}/${rsid}`, {
      timeoutMs,
      ttlMs: TTL.standard,
      // A variant with no catalogued association is an answer, not a failure.
      emptyOn: [404],
    });
    meta?.record(result);
    return result.json.mapped_genes ?? [];
  } catch {
    // This is a best-effort enrichment: if the Catalog is down or has no
    // record, the variant still resolves, just without gene context.
    return [];
  }
}

/**
 * `meta` is optional so the resolver can call this plainly while the dbSNP
 * panel gets truthful provenance from the same parser. The URL is identical in
 * both cases, so the panel's call is a cache hit and reports itself as one —
 * one upstream request, honestly attributed, no second parser to drift.
 */
export async function resolveRsid(
  rsid: string,
  timeoutMs = 10000,
  meta?: FetchMeta,
): Promise<VariantInfo> {
  const numeric = rsid.replace(/^rs/i, '');
  const url = `${ESUMMARY}?db=snp&id=${encodeURIComponent(numeric)}&retmode=json${apiKeyParam()}`;

  const result = await fetchJson<ESummaryResponse>(url, { timeoutMs, ttlMs: TTL.standard });
  meta?.record(result);
  const { json } = result;

  const record = json.result?.[numeric];
  if (!record || Array.isArray(record) || !record.snp_id) {
    throw new NoEntry(`dbSNP has no record for ${rsid}`);
  }

  const dbsnpGenes = (record.genes ?? []).map((g) => g.name).filter((n): n is string => Boolean(n));

  let genes = dbsnpGenes;
  let geneSource: VariantInfo['geneSource'] = dbsnpGenes.length ? 'dbSNP' : 'none';

  if (!genes.length) {
    const mapped = await mappedGenesFromGwasCatalog(rsid.toLowerCase(), timeoutMs, meta);
    if (mapped.length) {
      genes = mapped;
      geneSource = 'GWAS Catalog';
    }
  }

  return {
    rsid: `rs${record.snp_id}`,
    chrpos: record.chrpos,
    alleles: allelesFromSpdi(record.spdi),
    snpClass: record.snp_class,
    clinicalSignificance: record.clinical_significance || undefined,
    majorStudyMaf: largestStudyMaf(record.global_mafs),
    genes,
    geneSource,
  };
}
