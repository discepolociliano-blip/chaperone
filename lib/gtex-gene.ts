// GTEx reference/gene: the source of the Ensembl gene id and the versioned
// GENCODE id. PROJECT-PLAN.md §6.5 — Ensembl REST measured 12s and 503s during
// gate 1, so GTEx supplies these instead.
//
// GTEx's expression endpoints require the version suffix (ENSG…​.14), which
// only this endpoint gives us, so it earns its place twice over.

import { fetchJson, NoEntry } from './http';
import { TTL } from './cache';
import { GTEX_GENCODE_VERSION, stripGencodeVersion } from './gtex-dataset';

const BASE = 'https://gtexportal.org/api/v2/reference/gene';

interface GtexGene {
  gencodeId?: string;
  geneSymbol?: string;
  entrezGeneId?: number;
  chromosome?: string;
  start?: number;
  end?: number;
  strand?: string;
  description?: string;
  geneType?: string;
}

interface GtexResponse {
  data?: GtexGene[];
}

export interface GeneLocation {
  gencodeId: string;
  /** Unversioned, for everything that is not GTEx. */
  ensemblGene: string;
  symbol?: string;
  entrezGeneId?: string;
  chromosome?: string;
  start?: number;
  end?: number;
  strand?: string;
  geneType?: string;
  cached: boolean;
}

/**
 * Accepts a symbol, an ENSG, or a versioned GENCODE id.
 *
 * The GENCODE release is pinned (see gtex-dataset.ts) so the id returned here
 * is guaranteed to be the one GTEx's expression endpoints can answer for. Any
 * incoming version suffix is stripped first: a suffix from a different release
 * matches nothing and would come back empty.
 */
export async function lookupGene(geneId: string, timeoutMs = 8000): Promise<GeneLocation> {
  const query = stripGencodeVersion(geneId);
  const url =
    `${BASE}?geneId=${encodeURIComponent(query)}` +
    `&gencodeVersion=${GTEX_GENCODE_VERSION}`;
  const { json, cached } = await fetchJson<GtexResponse>(url, { timeoutMs, ttlMs: TTL.long });

  const hit = json.data?.[0];
  if (!hit?.gencodeId) throw new NoEntry(`GTEx has no gene record for ${geneId}`);

  return {
    gencodeId: hit.gencodeId,
    ensemblGene: hit.gencodeId.split('.')[0] ?? hit.gencodeId,
    symbol: hit.geneSymbol,
    entrezGeneId: hit.entrezGeneId != null ? String(hit.entrezGeneId) : undefined,
    chromosome: hit.chromosome,
    start: hit.start,
    end: hit.end,
    strand: hit.strand,
    geneType: hit.geneType,
    cached,
  };
}
