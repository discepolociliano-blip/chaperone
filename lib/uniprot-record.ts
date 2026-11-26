// UniProt fetch shared by the resolver and the UniProt panel, so one lookup
// serves both. PROJECT-PLAN.md §6.5: UniProt is the resolver spine because
// one ~1s call yields accession + HGNC + NCBI GeneID + transcripts, and
// because Ensembl measured 12s / 503 during gate 1.

import { fetchJson, NoEntry } from './http';
import { TTL } from './cache';

const BASE = 'https://rest.uniprot.org/uniprotkb/search';

/** Only the fields we use — keeps the response small and the contract explicit. */
const FIELDS = [
  'accession',
  'id',
  'protein_name',
  'gene_names',
  'organism_name',
  'sequence',
  'cc_subcellular_location',
  'cc_function',
  'xref_ensembl',
  'xref_geneid',
  'xref_hgnc',
  'protein_families',
].join(',');

interface CrossRef {
  database: string;
  id: string;
}

interface UniProtEntry {
  primaryAccession: string;
  uniProtkbId?: string;
  proteinDescription?: {
    recommendedName?: { fullName?: { value?: string } };
  };
  genes?: { geneName?: { value?: string } }[];
  sequence?: { length?: number };
  comments?: {
    commentType?: string;
    texts?: { value?: string }[];
    subcellularLocations?: { location?: { value?: string } }[];
  }[];
  uniProtKBCrossReferences?: CrossRef[];
}

interface SearchResponse {
  results?: UniProtEntry[];
}

export interface UniProtRecord {
  accession: string;
  entryName?: string;
  proteinName?: string;
  symbol?: string;
  length?: number;
  functionText?: string;
  subcellular: string[];
  hgnc?: string;
  ncbiGene?: string;
  transcripts: string[];
  fetchedAt: number;
  cached: boolean;
}

function xrefs(entry: UniProtEntry, db: string): string[] {
  return (entry.uniProtKBCrossReferences ?? []).filter((x) => x.database === db).map((x) => x.id);
}

function shape(entry: UniProtEntry, cached: boolean, fetchedAt: number): UniProtRecord {
  const subcellular = (entry.comments ?? [])
    .filter((c) => c.commentType === 'SUBCELLULAR LOCATION')
    .flatMap((c) => (c.subcellularLocations ?? []).map((s) => s.location?.value))
    .filter((v): v is string => Boolean(v));

  const functionText = (entry.comments ?? [])
    .filter((c) => c.commentType === 'FUNCTION')
    .flatMap((c) => (c.texts ?? []).map((t) => t.value))
    .filter((v): v is string => Boolean(v))[0];

  return {
    accession: entry.primaryAccession,
    entryName: entry.uniProtkbId,
    proteinName: entry.proteinDescription?.recommendedName?.fullName?.value,
    symbol: entry.genes?.[0]?.geneName?.value,
    length: entry.sequence?.length,
    functionText,
    subcellular: [...new Set(subcellular)],
    hgnc: xrefs(entry, 'HGNC')[0],
    ncbiGene: xrefs(entry, 'GeneID')[0],
    transcripts: xrefs(entry, 'Ensembl'),
    fetchedAt,
    cached,
  };
}

async function query(q: string, timeoutMs: number): Promise<UniProtRecord> {
  const url = `${BASE}?query=${encodeURIComponent(q)}&format=json&size=1&fields=${FIELDS}`;
  const { json, cached, fetchedAt } = await fetchJson<SearchResponse>(url, {
    timeoutMs,
    ttlMs: TTL.long, // UniProt reviewed entries move on a release cadence.
  });
  const entry = json.results?.[0];
  if (!entry) throw new NoEntry('No reviewed human UniProt entry matches this query');
  return shape(entry, cached, fetchedAt);
}

/**
 * Reviewed (Swiss-Prot) human entries only. Unreviewed TrEMBL entries would
 * introduce duplicates and uncurated names into the resolver spine.
 */
export function bySymbol(symbol: string, timeoutMs = 10000): Promise<UniProtRecord> {
  return query(`gene_exact:${symbol} AND organism_id:9606 AND reviewed:true`, timeoutMs);
}

export function byAccession(accession: string, timeoutMs = 10000): Promise<UniProtRecord> {
  return query(`accession:${accession}`, timeoutMs);
}

export function byEnsembl(ensemblId: string, timeoutMs = 10000): Promise<UniProtRecord> {
  const bare = ensemblId.split('.')[0] ?? ensemblId;
  return query(`xref:ensembl-${bare} AND organism_id:9606 AND reviewed:true`, timeoutMs);
}
